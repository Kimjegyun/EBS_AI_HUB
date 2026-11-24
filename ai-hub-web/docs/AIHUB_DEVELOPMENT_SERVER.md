# AI Hub development server

Run `start-aihub-dev.cmd` to start the local USER, ADMIN, LOG, and backend services and open the three browser pages. The same launcher is available in VS Code under **Terminal > Run Task > AI Hub: start development servers**.

Run `npm run install:aihub:dev:auto-start` once to register the current Windows user's logon task. It keeps the services running while that user is signed in and retries services that stop. The task is named `EBS AI HUB Development Servers`.

Vite serves the UI pages with HMR, so saved frontend changes appear in the browser automatically. The backend runs with `tsx watch` and restarts when backend source files change. Logs are written under `.runtime/aihub-dev/`.

Local addresses:

- USER: <https://localhost:5173/>
- ADMIN: <https://localhost:5174/admin/>
- LOG: <https://localhost:5175/>
- Backend: <http://localhost:3001/>
