import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    commentbody: { type: String, required: true },
    usercommented: { type: String },
    city: { type: String, default: null },
    lang: { type: String, default: null },
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    commentedon: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// indexes
commentSchema.index({ videoid: 1, commentedon: -1 });

export default mongoose.model("comment", commentSchema);
