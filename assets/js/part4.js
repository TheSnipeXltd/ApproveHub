/* =========================================================
   ApproveHub — PART 4 (separate file, safe extension)
   Extends core behaviour, then boots app.
========================================================= */

(function () {
  const APP = window.__APP__;

  if (!APP) {
    console.error("ApproveHub Part4: Core not loaded.");
    return;
  }

  const {
    state,
    ROUTES,
    wireAfterRender,
    route,
    initCore,
    toast
  } = APP;

  /* ---------------------------------------------------------
     Example: extend behaviour safely
  --------------------------------------------------------- */

  // Example enhancement — protect settings route
  const originalRoute = route;

  APP.route = function () {
    const hash = location.hash || "#/jobs";
    const routeId = hash.replace("#/", "");

    if (routeId === "settings" && state.role === "payee") {
      toast("Access denied", "Payee role cannot access Settings.");
      location.hash = "#/jobs";
      return;
    }

    originalRoute();
  };

  /* ---------------------------------------------------------
     Boot the app now that everything is extended
  --------------------------------------------------------- */

  initCore();
})();
