import mongoose from "mongoose";
const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  joinedon: { type: Date, default: Date.now },

  plan: { type: String, enum: ["free", "bronze", "silver", "gold"], default: "free" },
  planExpiry: { type: Date, default: null },

  allowedWatchDuration: { type: Number, default: 300 },
});

export default mongoose.model("user", userschema);
