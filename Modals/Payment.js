import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        userid: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true,
        },
        razorpayPaymentId: {
            type: String,
        },
        razorpaySignature: {
            type: String,
        },
        amount: {
            type: Number,
            required: true, // in paise
        },
        currency: {
            type: String,
            default: "INR",
        },
        status: {
            type: String,
            enum: ["pending", "completed", "failed"],
            default: "pending",
        },
        planType: {
            type: String,
            enum: ["free", "bronze", "silver", "gold"],
            default: "free",
        },
        planDuration: {
            type: Number,
            default: 30,
        },
        // allowed watch duration in seconds (0 = unlimited)
        allowedWatchDuration: { type: Number, default: 300 },
        expiryDate: {
            type: Date,
        },
        downloadLimit: {
            type: Number,
            default: -1,
        },
        downloadsUsed: {
            type: Number,
            default: 0,
        },
        paymentDate: {
            type: Date,
            default: Date.now,
        },
        notes: {
            type: String,
        },
    },
    { timestamps: true }
);

// Index for quick lookups
paymentSchema.index({ userid: 1, status: 1 });
paymentSchema.index({ userid: 1, expiryDate: 1 });
// paymentSchema.index({ razorpayOrderId: 1 });

export default mongoose.model("Payment", paymentSchema);
