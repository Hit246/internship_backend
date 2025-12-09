import Download from "../Modals/download.js";
import User from "../Modals/Auth.js";
import Video from "../Modals/video.js";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

// Check how many videos user has downloaded today
export const checkDownloadLimit = async (req, res) => {
    try {
        const { userid } = req.body;

        if (!userid || !mongoose.Types.ObjectId.isValid(userid)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        // Get user to check premium status
        const user = await User.findById(userid);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // If premium, no limit
        if (user.isPremium && user.premiumExpiry > new Date()) {
            return res.status(200).json({
                canDownload: true,
                remaining: Infinity,
                isPremium: true,
                message: "Premium user - unlimited downloads",
            });
        }

        // Check downloads today for free users
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const downloadsToday = await Download.countDocuments({
            userid: new mongoose.Types.ObjectId(userid),
            downloadedAt: { $gte: today, $lt: tomorrow },
            isPremiumUser: false,
        });

        const dailyLimit = 1;
        const remaining = Math.max(0, dailyLimit - downloadsToday);
        const canDownload = remaining > 0;

        return res.status(200).json({
            canDownload,
            remaining,
            isPremium: false,
            downloadsToday,
            dailyLimit,
            message: canDownload
                ? `You can download ${remaining} more video today`
                : "Daily limit reached. Upgrade to premium for unlimited downloads",
        });
    } catch (err) {
        console.error("checkDownloadLimit error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

// Download a video
export const downloadVideo = async (req, res) => {
    try {
        const { videoid, userid } = req.body;

        if (!videoid || !userid) {
            return res.status(400).json({ message: "Missing videoid or userid" });
        }

        if (
            !mongoose.Types.ObjectId.isValid(videoid) ||
            !mongoose.Types.ObjectId.isValid(userid)
        ) {
            return res.status(400).json({ message: "Invalid ID format" });
        }

        // Get user
        const user = await User.findById(userid);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Get video
        const video = await Video.findById(videoid);
        if (!video) {
            return res.status(404).json({ message: "Video not found" });
        }

        // Check if premium or within daily limit
        let isPremiumUser = false;
        if (user.isPremium && user.premiumExpiry > new Date()) {
            isPremiumUser = true;
        } else {
            // Check daily limit
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const downloadsToday = await Download.countDocuments({
                userid: new mongoose.Types.ObjectId(userid),
                downloadedAt: { $gte: today, $lt: tomorrow },
                isPremiumUser: false,
            });

            if (downloadsToday >= 1) {
                return res.status(403).json({
                    message: "Daily download limit reached. Upgrade to premium",
                    canUpgrade: true,
                });
            }
        }

        // Create download record
        const downloadRecord = new Download({
            userid: new mongoose.Types.ObjectId(userid),
            videoid: new mongoose.Types.ObjectId(videoid),
            isPremiumUser,
            originalFilepath: video.filepath,
            originalFilename: video.filename,
            videoTitle: video.videotitle,
        });

        await downloadRecord.save();

        // Return download info (frontend will handle actual download)
        return res.status(200).json({
            success: true,
            message: "Download initiated",
            downloadData: {
                filename: video.filename,
                filepath: video.filepath,
                title: video.videotitle,
                downloadId: downloadRecord._id,
            },
        });
    } catch (err) {
        console.error("downloadVideo error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

// Get user's download history
export const getDownloadHistory = async (req, res) => {
    try {
        const { userid } = req.params;

        if (!userid || !mongoose.Types.ObjectId.isValid(userid)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const downloads = await Download.find({
            userid: new mongoose.Types.ObjectId(userid),
            deleted: false,
        })
            .populate("videoid", "videotitle thumbnail filepath views createdAt")
            .sort({ downloadedAt: -1 })
            .lean();

        return res.status(200).json({
            downloads: downloads || [],
            total: downloads.length,
        });
    } catch (err) {
        console.error("getDownloadHistory error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

// Delete download record
export const deleteDownload = async (req, res) => {
    try {
        const { downloadid } = req.params;
        const { userid } = req.body;

        if (
            !downloadid ||
            !mongoose.Types.ObjectId.isValid(downloadid)
        ) {
            return res.status(400).json({ message: "Invalid download ID" });
        }

        const download = await Download.findById(downloadid);
        if (!download) {
            return res.status(404).json({ message: "Download not found" });
        }

        if (download.userid.toString() !== userid) {
            return res
                .status(403)
                .json({ message: "Not authorized to delete this download" });
        }

        download.deleted = true;
        await download.save();

        return res.status(200).json({ message: "Download deleted successfully" });
    } catch (err) {
        console.error("deleteDownload error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
