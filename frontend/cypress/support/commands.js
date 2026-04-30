Cypress.Commands.add("login", (email, password) => {
  cy.session(
    [email, password],
    () => {
      cy.visit("/login");
      cy.get("#identifier").type(email);
      cy.get("#password").type(password);
      cy.get('button[type="submit"]').click();
      cy.url().should("not.include", "/login");
    },
    {
      cacheAcrossSpecs: true,
    }
  );
});

Cypress.Commands.add("logout", () => {
  cy.visit("/");
  cy.contains("button", "Sign out").first().click();
  cy.url().should("not.include", "/profile");
});
