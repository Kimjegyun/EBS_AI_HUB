type Props = { title: string }

export default function PlaceholderPage({ title }: Props) {
  return (
    <main className="min-h-[calc(100vh-60px)] p-8 bg-background">
      <h1 className="font-display text-display text-on-surface mb-4">{title}</h1>
      <p className="text-on-surface-variant font-body-lg max-w-xl">
        이 화면은 Stitch 내보내기에 포함된 정적 HTML이 없어 플레이스홀더입니다. 다음 단계에서 플러그인 상세, 설정 섹션 등을
        이어서 구현할 수 있습니다.
      </p>
    </main>
  )
}
