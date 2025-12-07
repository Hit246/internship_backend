import express from "express";
import {
    postcomment,
    getallcomment,
    deletecomment,
    editcomment,
    reactComment,
    translateComment,
} from "../controllers/comment.js";

const routes = express.Router();

// GET comments for a video
// supports optional translateTo query param: /comment/:videoid?translateTo=en
routes.get("/:videoid", getallcomment);

// POST new comment
// body: { videoid, userid, commentbody, city? }
// (if you have auth middleware, you can ignore userid in body and use req.user)
routes.post("/postcomment", postcomment);

// DELETE comment (hard delete or by admin)
routes.delete("/deletecomment/:id", deletecomment);

// EDIT comment
routes.post("/editcomment/:id", editcomment);

// React (like/dislike)
routes.post("/react/:id", reactComment);

// Translate a single comment (optional).
// body: { to: 'en' }
routes.post("/translate/:id", translateComment);

export default routes;
