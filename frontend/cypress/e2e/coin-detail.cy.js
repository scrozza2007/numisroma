describe("Coin Detail", () => {
  let firstCoinUrl;

  before(() => {
    cy.visit("/browse");
    cy.get("a[href*='/coin-detail']", { timeout: 10000 })
      .first()
      .then(($a) => {
        firstCoinUrl = $a.attr("href");
      });
  });

  beforeEach(() => {
    if (firstCoinUrl) {
      cy.visit(firstCoinUrl);
    } else {
      cy.visit("/browse");
      cy.get("a[href*='/coin-detail']", { timeout: 10000 }).first().click();
    }
  });

  it("shows coin detail page with key fields", () => {
    cy.url().should("include", "/coin-detail");
    cy.get("h1, h2").should("exist");
  });

  it("displays coin obverse image", () => {
    cy.get("img").should("exist");
  });

  it("shows emperor or denomination info", () => {
    cy.get("body").then(($body) => {
      const text = $body.text().toLowerCase();
      expect(
        text.includes("emperor") ||
          text.includes("denomination") ||
          text.includes("material") ||
          text.includes("mint")
      ).to.be.true;
    });
  });

  it("shows a back/browse link", () => {
    cy.get("a[href='/browse'], a[href*='browse']").should("exist");
  });
});
