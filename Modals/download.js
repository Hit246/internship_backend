import mongoose from "mongoose";

const downloadSchema = mongoose.Schema({
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
    downloadedAt: {
        type: Date,
        default: Date.now,
    },
    isPremiumUser: {
        type: Boolean,
        default: false,
    },
    // Store original filepath and filename for download
    originalFilepath: String,
    originalFilename: String,
    videoTitle: String,
    deleted: {
        type: Boolean,
        default: false,
    },
});

export default mongoose.model("download", downloadSchema);
