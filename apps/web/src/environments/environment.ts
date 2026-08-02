export const environment = {
  production: true,
  // Relative, not absolute -- the production deployment (infra/deployment/)
  // serves the API on the same origin as this app via an nginx reverse
  // proxy (infra/docker/web.nginx.conf), so there is no cross-origin call
  // to configure a host for. A hardcoded `http://localhost:3000/...` here
  // was a pre-existing bug: it shipped in every production build (this file
  // has no fileReplacement in angular.json's "production" configuration)
  // and would only ever have worked on the machine that built it.
  apiUrl: '/api/v1',
};
