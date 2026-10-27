// Mock de la API de GitHub parcheando window.fetch (para E2E del panel)
// Se pega en agent-browser eval como una sola expresión IIFE.
(() => {
  const origFetch = window.fetch.bind(window);
  const CAT = "W3siaWQiOiAidGVzdC1ydW5uZXItYWJjMSIsICJ0aXRsZSI6ICJUZXN0IFJ1bm5lciIsICJ0YWdsaW5lIjogIkp1ZWdvIGRlIHBydWViYSIsICJkZXNjcmlwdGlvbiI6ICJEZXNjcmlwY2lcdTAwZjNuIGRlIHBydWViYSIsICJsb25nRGVzY3JpcHRpb24iOiAiRGVzYyBsYXJnYSIsICJjb3ZlciI6ICIvZ2FtZXMvY29tbXVuaXR5L3Rlc3QtcnVubmVyLWFiYzEuanBnIiwgInVybCI6ICJodHRwczovL2V4YW1wbGUuY29tL2dhbWUvIiwgImNhdGVnb3JpZXMiOiBbIkFjY2lcdTAwZjNuIl0sICJ0YWdzIjogWyJBY2NpXHUwMGYzbiIsICJDb211bmlkYWQiXSwgInJhdGluZyI6IDQuNywgInBsYXllcnMiOiAiTnVldm8iLCAiZGlmZmljdWx0eSI6ICJNZWRpYSIsICJhY2NlbnQiOiAiIzM4YmRmOCJ9XQ==";
  const CFG = "eyJmZWF0dXJlZElkIjogbnVsbH0=";
  window.__ghCalls = [];
  const ok = (obj) =>
    new Response(JSON.stringify(obj), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (String(url).startsWith("https://api.github.com/")) {
      window.__ghCalls.push({
        method: init?.method ?? "GET",
        url: String(url).split("?")[0],
        body: init?.body ? String(init.body).slice(0, 300) : null,
      });
      if (url.includes("/contents/public/data/community-games.json"))
        return ok({ sha: "cat-sha", content: CAT });
      if (url.includes("/contents/public/data/site-config.json"))
        return ok({ sha: "cfg-sha", content: CFG });
      if (url.includes("/git/ref/heads/main"))
        return ok({ object: { sha: "head-sha-1" } });
      if (url.includes("/git/commits"))
        return ok({ sha: "commit-new-sha", tree: { sha: "tree-base" } });
      if (url.includes("/git/blobs"))
        return ok({ sha: "blob-sha-" + (window.__ghCalls.length) });
      if (url.includes("/git/trees")) return ok({ sha: "tree-new-sha" });
      if (url.includes("/git/refs/heads/main"))
        return ok({ object: { sha: "commit-new-sha" } });
      return ok({ message: "unmocked-github-path" });
    }
    return origFetch(input, init);
  };
  return "fetch-mock-installed";
})()
