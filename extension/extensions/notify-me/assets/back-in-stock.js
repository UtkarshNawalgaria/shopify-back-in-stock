class BackInStock extends HTMLElement {
  constructor() {
    super();
    this.formAction = "";
    this.form = this.querySelector("form");
    this.showPhoneInput = this.dataset.showPhone == "true";
    this.init();
  }

  init() {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      let phone = null;
      const name = this.form.querySelector('input[name="name"]').value;
      const email = this.form.querySelector('input[name="email"]').value;
      const productId = this.form.querySelector('input[name="productId"]').value;

      if (this.showPhoneInput) {
        phone = this.form.querySelector('input[name="phone"]').value;
      }

      window.api
        .fetch("https://shopifybuddy-app--development.gadget.app/notifyMe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name,
            email: email,
            productId: productId,
          }),
        })
        .then((response) => response.json())
        .then((data) => console.log(data))
        .catch((error) => console.log(error));

      console.log(name, email, phone, productId);
    });
  }
}

customElements.define("back-in-stock", BackInStock);
