import Razorpay from "razorpay";
import User from "../Modals/Auth.js";
import mongoose from "mongoose";
import crypto from "crypto";

// Initialize Razorpay - with fallback for demo mode
let razorpay = null;
try {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
} catch (err) {
    console.warn("Razorpay initialization warning:", err.message);
}

export const createOrder = async (req, res) => {
    try {
        const { userid, planType } = req.body;

        if (!userid || !mongoose.Types.ObjectId.isValid(userid)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        // Plan pricing (in paise - smallest unit)
        const plans = {
            monthly: { amount: 9900, description: "1 Month Premium" }, // 99 INR
            yearly: { amount: 99900, description: "1 Year Premium" }, // 999 INR
        };

        const selectedPlan = plans[planType] || plans.monthly;

        // If Razorpay is available, use it; otherwise use demo mode
        let order;
        if (razorpay) {
            try {
                order = await razorpay.orders.create({
                    amount: selectedPlan.amount,
                    currency: "INR",
                    receipt: `premium_${userid}_${Date.now()}`,
                    description: selectedPlan.description,
                    customer_notify: 1,
                });
            } catch (razorpayErr) {
                console.warn("Razorpay API error, using demo mode:", razorpayErr.message);
                order = {
                    id: `order_demo_${Date.now()}`,
                    amount: selectedPlan.amount,
                    currency: "INR",
                    receipt: `premium_${userid}_${Date.now()}`,
                    created_at: Math.floor(Date.now() / 1000),
                };
            }
        } else {
            order = {
                id: `order_demo_${Date.now()}`,
                amount: selectedPlan.amount,
                currency: "INR",
                receipt: `premium_${userid}_${Date.now()}`,
                created_at: Math.floor(Date.now() / 1000),
            };
        }

        return res.status(200).json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                planType,
                description: selectedPlan.description,
            },
        });
    } catch (err) {
        console.error("createOrder error:", err);
        return res.status(500).json({ message: "Failed to create order", error: err.message });
    }
};

// Verify payment and activate premium
export const verifyPayment = async (req, res) => {
    try {
        const { userid, razorpay_order_id, razorpay_payment_id, razorpay_signature, planType } = req.body;

        if (!userid || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                message: "Missing payment details",
                received: { userid, razorpay_order_id, razorpay_payment_id, razorpay_signature }
            });
        }

        if (!mongoose.Types.ObjectId.isValid(userid)) {
            return res.status(400).json({ message: "Invalid user ID format" });
        }

        let isValidPayment = false;

        // Demo mode check first
        const isDemoOrder = razorpay_order_id && razorpay_order_id.includes("demo");
        const isDemoPayment = razorpay_payment_id && razorpay_payment_id.includes("demo");

        if (isDemoOrder && isDemoPayment) {
            // Demo mode - accept demo payment
            isValidPayment = true;
            console.log("Processing demo payment:", { razorpay_order_id, razorpay_payment_id });
        } else if (razorpay && process.env.RAZORPAY_KEY_SECRET) {
            // Production mode - verify with Razorpay signature
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(body)
                .digest("hex");
            isValidPayment = expectedSignature === razorpay_signature;
        } else {
            // Fallback for production without keys
            console.warn("No Razorpay credentials available for real payment verification");
            isValidPayment = false;
        }

        if (!isValidPayment) {
            console.error("Payment verification failed:", { razorpay_order_id, razorpay_payment_id, isDemoOrder, isDemoPayment });
            return res.status(400).json({ message: "Payment verification failed" });
        }

        // Calculate premium expiry
        let premiumExpiry = new Date();
        if (planType === "yearly") {
            premiumExpiry.setFullYear(premiumExpiry.getFullYear() + 1);
        } else {
            premiumExpiry.setMonth(premiumExpiry.getMonth() + 1);
        }

        // Update user to premium
        const updatedUser = await User.findByIdAndUpdate(
            new mongoose.Types.ObjectId(userid),
            {
                isPremium: true,
                premiumExpiry: premiumExpiry,
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Payment verified and premium activated",
            user: {
                id: updatedUser._id,
                isPremium: updatedUser.isPremium,
                premiumExpiry: updatedUser.premiumExpiry,
            },
        });
    } catch (err) {
        console.error("verifyPayment error:", err);
        return res.status(500).json({ message: "Failed to verify payment", error: err.message });
    }
};

export const checkPremiumStatus = async (req, res) => {
    try {
        const { userid } = req.params;

        if (!userid || !mongoose.Types.ObjectId.isValid(userid)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const user = await User.findById(userid);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const now = new Date();
        const isPremiumActive = user.isPremium && user.premiumExpiry > now;

        return res.status(200).json({
            isPremium: isPremiumActive,
            premiumExpiry: user.premiumExpiry,
            daysRemaining: isPremiumActive
                ? Math.ceil((user.premiumExpiry - now) / (1000 * 60 * 60 * 24))
                : 0,
        });
    } catch (err) {
        console.error("checkPremiumStatus error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
