function initializeApp(){

    const navbar = document.querySelector(".navbar");

    const reveals = document.querySelectorAll(".reveal");

    function reveal(){

        reveals.forEach(element=>{

            const top = element.getBoundingClientRect().top;

            if(top < window.innerHeight - 120){

                element.classList.add("active");

            }

        });

    }

    reveal();

    window.addEventListener("scroll",()=>{

        if(window.scrollY > 80){

            navbar.classList.add("navbarScrolled");

        }

        else{

            navbar.classList.remove("navbarScrolled");

        }

        reveal();

    });

}