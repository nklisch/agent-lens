// Shared client-side code loaded on every page
// Just a simple logger and nav highlight for now
(() => {
	console.log("App initialized on", window.location.pathname);

	// Highlight current nav link
	var links = document.querySelectorAll("nav a");
	for (var i = 0; i < links.length; i++) {
		if (links[i].getAttribute("href") === window.location.pathname) {
			links[i].style.fontWeight = "bold";
		}
	}
})();
