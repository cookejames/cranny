// CloudFront viewer-request function for the analytics proxy (infra/cdn.tf): PostHog serves
// /e/, /static/… and so on at its root, so drop the /relay prefix the app sends them under.
// CloudFront calls `handler` itself; the runtime has no exports.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handler(event) {
  var request = event.request;
  request.uri = request.uri.replace(/^\/relay(?=\/|$)/, '') || '/';
  return request;
}
