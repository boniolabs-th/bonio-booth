# Bonio Booth

<img src=".erb/img/erb-banner.svg" width="100%" />

<br>

<p>
  Bonio Booth uses <a href="https://electron.atom.io/">Electron</a>, <a href="https://facebook.github.io/react/">React</a>, <a href="https://github.com/reactjs/react-router">React Router</a>, <a href="https://webpack.js.org/">Webpack</a> and <a href="https://www.npmjs.com/package/react-refresh">React Fast Refresh</a>.
</p>

<br>

## Install

Clone the repo and install dependencies:

```bash
git clone https://github.com/boniolabs-th/bonio-booth.git
cd bonio-booth
npm install
```

## Starting Development

Start the app in the `dev` environment:

```bash
npm start
```

## Packaging for Production

To package apps for the local platform:

```bash
npm run package
```

## Available Scripts

- **`npm start`**: Start the app in development mode with hot reload
- **`npm run build`**: Build the app for production
- **`npm run package`**: Package the app for the current platform
- **`npm run lint`**: Run ESLint on the codebase
- **`npm run lint:fix`**: Run ESLint and automatically fix issues
- **`npm test`**: Run the test suite

## Project Structure

```
src/
├── main/           # Main process (Node.js/Electron)
├── renderer/       # Renderer process (React)
└── __tests__/      # Test files
.erb/
├── configs/        # Webpack configurations
├── scripts/        # Build and development scripts
└── mocks/          # Test mocks
assets/             # Static assets and icons
```

## License

MIT © [Bonio Labs Thailand](https://github.com/boniolabs-th)
