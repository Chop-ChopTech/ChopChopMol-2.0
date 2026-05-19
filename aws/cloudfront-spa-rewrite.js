// cloudfront-spa-rewrite.js — CloudFront Function for single-page-app routing.
// ===========================================================================
// OPTIONAL — a cleaner alternative to the "custom error responses" method in
// AWS_MIGRATION_GUIDE.md §5.4a. Use whichever you prefer; don't use both.
//
// This reproduces Firebase Hosting's rewrite rule (everything -> /index.html)
// so deep links and client-side routes resolve to the app shell, while real
// files (main.js, *.css, *.png, /atom/atom.js, ...) are served normally.
//
// Install:
//   CloudFront console -> Functions -> Create function
//     Name:    chopchopmol-spa-rewrite
//     Runtime: cloudfront-js-2.0
//   Paste this file, Save, then Publish.
//   Then: your distribution -> Behaviors -> edit the Default behavior ->
//     Function associations -> Viewer request -> select this function -> Save.
// ===========================================================================

function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Has a file extension (.js, .css, .png, .json, .wasm, .ico, ...) ->
    // it's a real asset, leave it alone.
    if (uri.includes('.')) {
        return request;
    }

    // Directory-style path -> serve index.html in that directory.
    if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
        return request;
    }

    // Extension-less path (a client route / deep link) -> the app shell.
    request.uri = '/index.html';
    return request;
}
