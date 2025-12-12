import mongoose from "mongoose";
import nodemailer from "nodemailer";
import axios from "axios";
import users from "../Modals/Auth.js";

export const login = async (req, res) => {
  const { email, name, image } = req.body;

  try {
    const existingUser = await users.findOne({ email });

    if (!existingUser) {
      const newUser = await users.create({ email, name, image });
      return res.status(201).json({ result: newUser });
    } else {
      return res.status(200).json({ result: existingUser });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(500).json({ message: "User unavailable..." });
  }
  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          channelname: channelname,
          description: description,
        },
      },
      { new: true }
    );
    return res.status(201).json(updatedata);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const dispatchOtp = async (req, res) => {
  const { channel = "email", email, phone, state } = req.body || {};
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const lowerChannel = channel === "sms" ? "sms" : "email";

  try {
    if (lowerChannel === "email") {
      const transporter =
        process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
          ? nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          })
          : nodemailer.createTransport({
            jsonTransport: true, // dev-friendly fallback, logs instead of sending
          });

      const targetEmail = email || process.env.FALLBACK_EMAIL;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || "no-reply@example.com",
        to: targetEmail,
        subject: "Your login OTP",
        text: `Your OTP is ${otp}. State: ${state || "unknown"}`,
      });
    } else {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM) {
        return res.status(500).json({ message: "SMS provider not configured" });
      }
      if (!phone) {
        return res.status(400).json({ message: "Phone number required for SMS OTP" });
      }

      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        new URLSearchParams({
          From: process.env.TWILIO_FROM,
          To: phone,
          Body: `Your OTP is ${otp}. State: ${state || "unknown"}`,
        }),
        {
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN,
          },
        }
      );
    }

    return res.status(200).json({
      status: "queued",
      channel: lowerChannel,
      state: state || null,
      otpPreview: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (error) {
    console.error("Failed to dispatch OTP:", error);
    return res.status(500).json({ message: "Failed to dispatch OTP" });
  }
};
