export default function createApp({ React }) {
  return {
    Body: function Body({ maximized, toggleMaximize }) {
      const [name, setName] = React.useState('')

      return React.createElement(
        'main',
        { style: { display: 'grid', gap: 12, padding: 16 } },
        React.createElement('h2', null, 'Hello, AI Hub'),
        React.createElement('label', null,
          '이름 ',
          React.createElement('input', {
            value: name,
            onChange: (event) => setName(event.target.value),
            placeholder: '이름을 입력하세요',
          }),
        ),
        React.createElement('p', null, name ? `안녕하세요, ${name}님!` : '이름을 입력해 보세요.'),
        React.createElement('button', { type: 'button', onClick: toggleMaximize }, maximized ? '원래 크기로' : '앱 크게 보기'),
      )
    },
  }
}
