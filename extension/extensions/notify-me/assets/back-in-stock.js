class BackInStock extends HTMLElement {
  constructor() {
    super();
    this.formAction = "";
    this.form = this.querySelector("form");
    this.submitBtn = this.form.querySelector("button");
    this.loader = this.submitBtn.querySelector(".loader");
    this.showPhoneInput = this.dataset.showPhone == "true";
    this.init();
  }

  init() {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();

      let phone = null;
      const name = this.form.querySelector('input[name="name"]').value;
      const email = this.form.querySelector('input[name="email"]').value;
      const productId = this.form.querySelector(
        'input[name="productId"]'
      ).value;

      if (this.showPhoneInput) {
        phone = this.form.querySelector('input[name="phone"]').value;
      }

      // Disable Button
      this.submitBtn.disabled = true;
      // Add loading Icon
      this.loader.style.display = "inline-block";

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
        .then((response) => {
          if (!response.ok) {
            throw new Error();
          }

          return response.json();
        })
        .then((data) => {
          // Hide form
          this.form.remove();

          // Show success message
          this.dataset.success = true;
          this.loader.style.display = "none"
        })
        .catch((error) => {
          const errorEle = this.querySelector(".error-message");
          errorEle.textContent = "Something went wrong. Please try again";
        });
    });
  }
}

customElements.define("back-in-stock", BackInStock);
