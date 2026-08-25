import { useCallback, useState } from 'react'
import migrationSql from '../../supabase/migrations/20260605090000_ai_hub_complete_auth_setup.sql?raw'
import { Icon } from './Icon'

const DASHBOARD = 'https://supabase.com/dashboard'

const ENV_DOTENV_TEMPLATE = `# ai-hub-web 폴더에 .env 파일을 만들고 아래 두 줄을 채웁니다.
# (저장 후 개발 서버를 반드시 다시 시작하세요.)

VITE_SUPABASE_URL=https://여기에-Project-URL.supabase.co
VITE_SUPABASE_ANON_KEY=여기에-anon-public-키-전체
`

type Props = {
  supabaseReady: boolean
  onGoToEdit?: () => void
}

export default function SupabaseConnectionGuide({ supabaseReady, onGoToEdit }: Props) {
  const [copied, setCopied] = useState<'env' | 'sql' | null>(null)

  const copy = useCallback(async (kind: 'env' | 'sql', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }, [])

  return (
    <div className="space-y-6 px-6 py-5">
      <p className="font-body text-body-sm text-on-surface-variant leading-relaxed">
        아래 순서대로 진행하면 Supabase와 연결되고, 이 화면의 <strong className="text-on-surface">환경 편집</strong> 탭에서
        입력한 값이 데이터베이스 <code className="rounded bg-surface-container-high px-1 font-mono text-caption">environment_config</code>{' '}
        테이블에 저장됩니다.
      </p>

      <ol className="space-y-5">
        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-semibold text-on-primary-container">
            1
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-h3 text-h3 text-on-surface">Supabase 프로젝트 만들기</p>
            <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
              <a
                href={DASHBOARD}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-90"
              >
                {DASHBOARD}
              </a>
              에서 로그인한 뒤 <strong>New project</strong>로 프로젝트를 생성합니다. 리전은 가까운 곳을 고르면 됩니다.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-semibold text-on-primary-container">
            2
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-h3 text-h3 text-on-surface">API URL·Anon 키 복사</p>
            <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
              대시보드에서 해당 프로젝트를 연 뒤{' '}
              <strong>Project Settings(톱니바퀴) → API</strong>로 이동합니다.{' '}
              <strong>Project URL</strong>과 <strong>Project API keys</strong>의 <strong>anon public</strong> 키만
              사용합니다. <strong>service_role</strong> 키는 브라우저에 넣지 마세요.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-semibold text-on-primary-container">
            3
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-h3 text-h3 text-on-surface">로컬에 .env 파일 만들기</p>
            <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
              Vite는 <strong className="text-on-surface">프론트 프로젝트 루트</strong>의 환경 변수를 읽습니다. 이 저장소에서는{' '}
              <code className="rounded bg-surface-container-high px-1 font-mono text-caption">ai-hub-web</code> 폴더와
              같은 위치에 <code className="rounded bg-surface-container-high px-1 font-mono text-caption">.env</code>를
              만듭니다. (상위 워크스페이스 루트에만 두면 Vite가 읽지 못합니다.)
            </p>
            <div className="relative rounded-lg border border-outline-variant bg-inverse-surface/5">
              <pre className="max-h-40 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-on-surface sm:text-body-sm">
                {ENV_DOTENV_TEMPLATE.trim()}
              </pre>
              <button
                type="button"
                onClick={() => void copy('env', ENV_DOTENV_TEMPLATE.trim())}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-outline-variant bg-surface-container px-2 py-1 font-caption text-caption text-on-surface hover:bg-surface-container-high"
              >
                <Icon name="content_copy" className="text-[16px]" />
                {copied === 'env' ? '복사됨' : '복사'}
              </button>
            </div>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-semibold text-on-primary-container">
            4
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-h3 text-h3 text-on-surface">SQL 마이그레이션 실행</p>
            <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
              Supabase 대시보드 <strong>SQL Editor</strong>에서 새 쿼리를 열고, 아래 전체를 붙여 넣은 뒤 <strong>Run</strong>
              으로 실행합니다. <code className="rounded bg-surface-container-high px-1 font-mono text-caption">public.environment_config</code>{' '}
              테이블과 RLS 정책이 생성됩니다.
            </p>
            <div className="relative rounded-lg border border-outline-variant bg-inverse-surface/5">
              <pre className="max-h-52 overflow-auto p-3 font-mono text-[10px] leading-relaxed text-on-surface sm:text-[11px]">
                {migrationSql.trim()}
              </pre>
              <button
                type="button"
                onClick={() => void copy('sql', migrationSql.trim())}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-outline-variant bg-surface-container px-2 py-1 font-caption text-caption text-on-surface hover:bg-surface-container-high"
              >
                <Icon name="content_copy" className="text-[16px]" />
                {copied === 'sql' ? '복사됨' : '복사'}
              </button>
            </div>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-semibold text-on-primary-container">
            5
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-h3 text-h3 text-on-surface">개발 서버 재시작</p>
            <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
              터미널에서 실행 중인 <code className="font-mono">npm run dev</code>를 중지(Ctrl+C)한 뒤,{' '}
              <code className="font-mono">ai-hub-web</code> 폴더에서 다시 <code className="font-mono">npm run dev</code>를
              실행합니다. 그래야 <code className="font-mono">VITE_*</code> 값이 반영됩니다.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              supabaseReady
                ? 'bg-secondary-container text-on-secondary-container'
                : 'bg-outline-variant text-on-surface-variant'
            }`}
          >
            6
          </span>
          <div className="min-w-0 space-y-2">
            <p className="font-h3 text-h3 text-on-surface">환경 값 입력 후 저장</p>
            <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
              연결이 되면 이 대화상자의 <strong>환경 편집</strong> 탭에서 서비스 이름·지원 이메일 등을 입력하고{' '}
              <strong>저장</strong>을 누릅니다. 저장 시 위 테이블의 <code className="font-mono text-caption">id=1</code>{' '}
              행에 JSON으로 기록됩니다.
            </p>
            {supabaseReady ? (
              <button
                type="button"
                onClick={onGoToEdit}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-h3 text-h3 text-on-primary hover:opacity-90"
              >
                환경 편집 탭으로 이동
                <Icon name="arrow_forward" className="text-[18px]" />
              </button>
            ) : (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 font-caption text-on-surface">
                아직 Supabase에 연결되지 않았습니다. 1~5단계를 마친 뒤 이 창을 닫았다가 다시 열어 주세요.
              </p>
            )}
          </div>
        </li>
      </ol>
    </div>
  )
}
