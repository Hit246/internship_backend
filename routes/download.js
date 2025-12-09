import express from "express";
import {
    downloadVideo,
    getDownloadHistory,
    checkDownloadLimit,
    deleteDownload,
} from "../controllers/download.js";

const routes = express.Router();

// Check if user can download (returns remaining downloads and premium status)
routes.post("/check-limit", checkDownloadLimit);

// Download a video (creates download record)
routes.post("/download", downloadVideo);

// Get user's download history
routes.get("/history/:userid", getDownloadHistory);

// Delete a download record
routes.delete("/delete/:downloadid", deleteDownload);

export default routes;
