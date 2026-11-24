export default function createApp({ React }) {
  return {
    id: 'import-example',
    defaultSize: { w: 4, h: 3, minW: 2, minH: 2 },
    Body: function Body() {
      const [count, setCount] = React.useState(0)
      return React.createElement('button', { onClick: () => setCount(count + 1) }, `가져온 앱: ${count}`)
    },
  }
}
