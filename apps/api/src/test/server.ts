import { setupServer } from "msw/node";

// Default-empty handler list. Each test file (or test) adds handlers via
// server.use(http.get(url, ...)) for the requests it cares about.
export const server = setupServer();
