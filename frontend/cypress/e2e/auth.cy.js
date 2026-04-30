const TIMESTAMP = Date.now();
const TEST_USER = {
  username: `testuser_${TIMESTAMP}`,
  email: `testuser_${TIMESTAMP}@example.com`,
  password: "Test1234!",
};

describe("Authentication", () => {
  describe("Register", () => {
    it("registers a new user successfully", () => {
      cy.visit("/register");
      cy.get("#username").type(TEST_USER.username);
      cy.get("#email").type(TEST_USER.email);
      cy.get("#password").type(TEST_USER.password);
      cy.get("#confirmPassword").type(TEST_USER.password);
      cy.get('button[type="submit"]').click();
      cy.url().should("not.include", "/register");
    });

    it("shows error for mismatched passwords", () => {
      cy.visit("/register");
      cy.get("#username").type("anyuser");
      cy.get("#email").type("any@example.com");
      cy.get("#password").type("Password1!");
      cy.get("#confirmPassword").type("Different1!");
      cy.get('button[type="submit"]').click();
      cy.url().should("include", "/register");
    });

    it("shows error for duplicate email", () => {
      cy.visit("/register");
      cy.get("#username").type(`other_${TIMESTAMP}`);
      cy.get("#email").type(TEST_USER.email);
      cy.get("#password").type(TEST_USER.password);
      cy.get("#confirmPassword").type(TEST_USER.password);
      cy.get('button[type="submit"]').click();
      cy.url().should("include", "/register");
    });
  });

  // Login tests use the user registered above. They run after Register within
  // the same Cypress worker process, so TEST_USER already exists in the DB.
  describe("Login", () => {
    it("logs in with valid credentials", () => {
      cy.visit("/login");
      cy.get("#identifier").type(TEST_USER.email);
      cy.get("#password").type(TEST_USER.password);
      cy.get('button[type="submit"]').click();
      cy.url().should("not.include", "/login");
    });

    it("shows error for invalid credentials", () => {
      cy.visit("/login");
      cy.get("#identifier").type("wrong@example.com");
      cy.get("#password").type("wrongpassword");
      cy.get('button[type="submit"]').click();
      cy.url().should("include", "/login");
    });

    it("requires both fields", () => {
      cy.visit("/login");
      cy.get('button[type="submit"]').click();
      cy.url().should("include", "/login");
    });
  });
});
