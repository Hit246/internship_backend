import Razorpay from "razorpay";
import User from "../Modals/Auth.js";
import Payment from "../Modals/Payment.js";
import mongoose from "mongoose";
import crypto from "crypto";
import nodemailer from "nodemailer";

// Initialize Razorpay - with fallback for demo mode
let razorpay = null;
try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.warn("Razorpay keys missing - running in demo mode", {
            RAZORPAY_KEY_ID: !!process.env.RAZORPAY_KEY_ID,
            RAZORPAY_KEY_SECRET: !!process.env.RAZORPAY_KEY_SECRET,
        });
    } else {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        console.log("Razorpay initialized with provided keys");
    }
} catch (err) {
    console.warn("Razorpay initialization warning:", err.message);
}

// setup nodemailer transporter if SMTP config present
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
} else {
    console.warn("Mailer not configured - no SMTP env vars found");
    console.log({
        SMTP_HOST: !!process.env.SMTP_HOST,
        SMTP_USER: !!process.env.SMTP_USER,
        SMTP_PASS: !!process.env.SMTP_PASS,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_SECURE: process.env.SMTP_SECURE,
    });

}

export const createOrder = async (req, res) => {
    try {
        const { userid, planType } = req.body;

        if (!userid || !mongoose.Types.ObjectId.isValid(userid)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        // Plan pricing (in paise - smallest unit) and allowed watch durations
        const plans = {
            bronze: { amount: 1000, description: "Bronze Plan - 7 min", allowedWatchDuration: 420, days: 30 },
            silver: { amount: 5000, description: "Silver Plan - 10 min", allowedWatchDuration: 600, days: 90 },
            gold: { amount: 10000, description: "Gold Plan - Unlimited", allowedWatchDuration: 0, days: 365 },
        };

        const selectedPlan = plans[planType] || plans.bronze;

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

        // persist payment record
        try {
            await Payment.create({
                userid: new mongoose.Types.ObjectId(userid),
                razorpayOrderId: order.id,
                amount: selectedPlan.amount,
                currency: order.currency || "INR",
                status: "pending",
                planType: planType,
                planDuration: selectedPlan.days,
                expiryDate: null,
                allowedWatchDuration: selectedPlan.allowedWatchDuration,
            });
        } catch (saveErr) {
            console.warn("Failed to save payment record:", saveErr.message);
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

        // Determine plan properties
        const planMap = {
            bronze: { days: 30, allowedWatchDuration: 420 },
            silver: { days: 90, allowedWatchDuration: 600 },
            gold: { days: 365, allowedWatchDuration: 0 },
        };
        const planInfo = planMap[planType] || planMap["bronze"];

        // Calculate plan expiry
        const premiumExpiry = new Date();
        premiumExpiry.setDate(premiumExpiry.getDate() + planInfo.days);

        // Update user plan fields
        const updatedUser = await User.findByIdAndUpdate(
            new mongoose.Types.ObjectId(userid),
            {
                plan: planType,
                planExpiry: premiumExpiry,
                allowedWatchDuration: planInfo.allowedWatchDuration,
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // update payment record
        try {
            await Payment.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                {
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                    status: "completed",
                    expiryDate: premiumExpiry,
                    paymentDate: new Date(),
                }
            );
        } catch (payUpdErr) {
            console.warn("Failed to update payment record:", payUpdErr.message);
        }

        // send invoice email if mailer configured
        try {
            const targetEmail = req.body.email || updatedUser.email;
            if (mailer && targetEmail) {
                const mailHtml = `
                    <h2>Payment Receipt - ${planType.toUpperCase()}</h2>
                    <p>Hi ${updatedUser.name || updatedUser.email},</p>
                    <p>Thank you for upgrading to the <strong>${planType}</strong> plan.</p>
                    <p>Amount: ₹${(Number(req.body.amount || 0) / 100).toFixed(2)}</p>
                    <p>Order ID: ${razorpay_order_id}</p>
                    <p>Payment ID: ${razorpay_payment_id}</p>
                    <p>Plan valid until: ${premiumExpiry.toISOString()}</p>
                `;

                await mailer.sendMail({
                    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
                    to: targetEmail,
                    subject: `YourTube - Payment Receipt (${planType})`,
                    html: mailHtml,
                });
            } else if (!mailer) {
                console.warn("Mailer not configured; skipping receipt email");
            } else {
                console.warn("No user email found; skipping receipt email");
            }
        } catch (mailErr) {
            console.warn("Failed to send invoice email:", mailErr.message);
        }

        return res.status(200).json({
            success: true,
            message: "Payment verified and plan activated",
            user: {
                id: updatedUser._id,
                plan: updatedUser.plan,
                planExpiry: updatedUser.planExpiry,
                allowedWatchDuration: updatedUser.allowedWatchDuration,
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
