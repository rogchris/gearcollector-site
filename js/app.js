window.addEventListener("load", () => {
  const loading = document.getElementById("loadingScreen");
  if (loading) {
    loading.classList.add("hidden");
    setTimeout(() => loading.remove(), 650);
  }

  document.querySelectorAll(".menu-item").forEach(el => el.classList.add("visible"));
});
