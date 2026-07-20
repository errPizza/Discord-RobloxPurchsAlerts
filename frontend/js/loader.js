async function loadComponent(id, file){

    const response = await fetch(file);

    const html = await response.text();

    document.getElementById(id).innerHTML = html;

}

async function initializeWebsite(){

    await loadComponent(
        "navbar",
        "components/navbar.html"
    );

    await loadComponent(
        "hero",
        "components/hero.html"
    );

    await loadComponent(
        "about",
        "components/about.html"
    );

    await loadComponent(
        "games",
        "components/games.html"
    );

    await loadComponent(
        "achievements",
        "components/achievements.html"
    );

    await loadComponent(
        "team",
        "components/team.html"
    );

    await loadComponent(
        "contact",
        "components/contact.html"
    );

    await loadComponent(
        "footer",
        "components/footer.html"
    );

    if(typeof initializeApp === "function"){

        initializeApp();

    }

}

initializeWebsite();