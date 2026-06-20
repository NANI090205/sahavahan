const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const adminAuthMiddleware = require("../middleware/adminAuth");

jest.mock("jsonwebtoken");
jest.mock("../models/User");

describe("SahaVahan Middleware Unit Tests", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe("authMiddleware", () => {
    test("should return 401 if authorization header is missing", () => {
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Token missing" });
      expect(next).not.toHaveBeenCalled();
    });

    test("should return 401 if token structure is malformed", () => {
      req.headers.authorization = "TokenOnlyNoBearer";
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Token missing" });
      expect(next).not.toHaveBeenCalled();
    });

    test("should call next and set req.userId/req.username if token is valid", () => {
      req.headers.authorization = "Bearer validtoken";
      jwt.verify.mockReturnValue({ userId: "user123", username: "testuser" });

      authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith("validtoken", expect.any(String));
      expect(req.userId).toBe("user123");
      expect(req.username).toBe("testuser");
      expect(next).toHaveBeenCalled();
    });

    test("should return 401 if token verification throws error", () => {
      req.headers.authorization = "Bearer invalidtoken";
      jwt.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Invalid token" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("adminAuthMiddleware", () => {
    test("should return 401 if authorization header is missing", async () => {
      await adminAuthMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: expect.stringContaining("missing") });
      expect(next).not.toHaveBeenCalled();
    });

    test("should return 403 if user is not an admin", async () => {
      req.headers.authorization = "Bearer user_token";
      jwt.verify.mockReturnValue({ userId: "user123" });
      User.findById.mockResolvedValue({ _id: "user123", role: "user" });

      await adminAuthMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Access Denied: Not an administrator" });
      expect(next).not.toHaveBeenCalled();
    });

    test("should call next if token is valid and user is admin", async () => {
      req.headers.authorization = "Bearer admin_token";
      jwt.verify.mockReturnValue({ userId: "admin123" });
      const mockAdmin = { _id: "admin123", role: "admin" };
      User.findById.mockResolvedValue(mockAdmin);

      await adminAuthMiddleware(req, res, next);

      expect(req.userId).toBe("admin123");
      expect(req.user).toBe(mockAdmin);
      expect(next).toHaveBeenCalled();
    });

    test("should return 401 if token verification fails", async () => {
      req.headers.authorization = "Bearer bad_token";
      jwt.verify.mockImplementation(() => {
        throw new Error("fail");
      });

      await adminAuthMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Access Denied: Invalid or expired token" });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
