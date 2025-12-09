import express from "express";
import {
    createOrder,
    verifyPayment,
    checkPremiumStatus,
} from "../controllers/payment.js";

const routes = express.Router();

// Create Razorpay order for premium subscription
routes.post("/create-order", createOrder);

// Verify payment and activate premium
routes.post("/verify-payment", verifyPayment);

// Check user's premium status
routes.get("/premium-status/:userid", checkPremiumStatus);

export default routes;
