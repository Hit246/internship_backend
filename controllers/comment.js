import Comment from "../Modals/comment.js";
import mongoose from "mongoose";
import axios from "axios";

/**
 * Strict validation: allow Unicode letters, numbers, spaces, and common punctuation.
 * Blocks emoji and other "special characters". If you want to allow emoji, change this.
 */
const COMMENT_ALLOWED_REGEX = new RegExp(
  String.raw`^[\p{L}\p{N}\s.,?!:;'"\-()/]+$`,
  "u"
);

// Helper: get client's IP and fetch city using ip-api.com
async function getCityFromRequest(req) {
  try {
    // forwarded IP header or remote address
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0] ||
      req.socket.remoteAddress ||
      null;

    if (!ip) return null;

    // ip-api doesn't require key for basic usage. For production use a paid provider.
    const resp = await axios.get(`http://ip-api.com/json/${ip}`);
    return resp.data?.city ?? null;
  } catch (err) {
    console.warn("getCityFromRequest failed:", err?.message ?? err);
    return null;
  }
}

// Helper: translate text using LibreTranslate
async function translateText(text, targetLang) {
  try {
    const url = process.env.TRANSLATE_URL || "https://libretranslate.de/translate";
    const apiKey = process.env.TRANSLATE_KEY || "";
    const resp = await axios.post(
      url,
      {
        q: text,
        source: "auto",
        target: targetLang,
        format: "text",
        api_key: apiKey || undefined,
      },
      { headers: { "Content-Type": "application/json" } }
    );
    return resp.data?.translatedText ?? null;
  } catch (err) {
    console.error("translateText error:", err?.response?.data ?? err?.message);
    return null;
  }
}

/**
 * POST /comment/postcomment
 * body: { videoid, userid, commentbody, city? , usercommented? }
 *
 * NOTE: If you have authentication middleware that sets req.user, prefer to use req.user._id
 */
export const postcomment = async (req, res) => {
  try {
    const { videoid, userid, commentbody, city: clientCity, usercommented } = req.body;

    if (!videoid || !commentbody) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const cleaned = String(commentbody).trim();
    if (cleaned.length === 0 || cleaned.length > 1000) {
      return res.status(400).json({ message: "Comment length invalid" });
    }

    if (!COMMENT_ALLOWED_REGEX.test(cleaned)) {
      return res.status(400).json({ message: "Comment contains forbidden characters" });
    }

    const userId = req.user?._id ?? userid;
    if (!userId) {
      return res.status(401).json({ message: "Auth required" });
    }

    let city = clientCity ?? null;
    if (!city) {
      city = await getCityFromRequest(req);
    }

    const commentDoc = new Comment({
      userid: new mongoose.Types.ObjectId(userId),
      videoid: new mongoose.Types.ObjectId(videoid),
      commentbody: cleaned,
      usercommented: usercommented ?? null,
      city,
      likes: 0,
      dislikes: 0,
    });

    await commentDoc.save();

    return res.status(201).json({ comment: commentDoc });
  } catch (err) {
    console.error("postcomment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /comment/:videoid?translateTo=xx
 * returns list of comments (non-deleted). If translateTo provided, will call translation API for each comment
 * Response: { comments: [ { ...comment fields..., translatedText? } ] }
 */
export const getallcomment = async (req, res) => {
  try {
    const { videoid } = req.params;
    const translateTo = req.query.translateTo ?? null;

    if (!videoid) return res.status(400).json({ message: "videoid required" });

    const docs = await Comment.find({ videoid: videoid, deleted: false })
      .sort({ commentedon: -1 })
      .lean();

    if (!translateTo) {
      return res.status(200).json({ comments: docs });
    }

    const translated = await Promise.all(
      docs.map(async (c) => {
        const t = await translateText(c.commentbody, String(translateTo));
        return { ...c, translatedText: t ?? null, translatedTo: translateTo };
      })
    );

    return res.status(200).json({ comments: translated });
  } catch (err) {
    console.error("getallcomment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * DELETE /comment/deletecomment/:id
 * Hard delete (admin) — use with care. We still keep `deleted` flag for auto-deletions.
 */
export const deletecomment = async (req, res) => {
  try {
    const { id: _id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(404).json({ message: "Comment unavailable" });
    }

    await Comment.findByIdAndDelete(_id);
    return res.status(200).json({ comment: true });
  } catch (err) {
    console.error("deletecomment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /comment/editcomment/:id
 * body: { commentbody }
 * Only allow owner or admin (authentication needed) — this example assumes req.user check if available.
 */
export const editcomment = async (req, res) => {
  try {
    const { id: _id } = req.params;
    const { commentbody } = req.body;
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(404).json({ message: "Comment unavailable" });
    }
    const cleaned = String(commentbody ?? "").trim();
    if (cleaned.length === 0 || cleaned.length > 1000)
      return res.status(400).json({ message: "Comment length invalid" });
    if (!COMMENT_ALLOWED_REGEX.test(cleaned)) {
      return res.status(400).json({ message: "Comment contains forbidden characters" });
    }

    // Optionally check ownership:
    const doc = await Comment.findById(_id);
    if (!doc) return res.status(404).json({ message: "Comment not found" });

    // If you have auth, allow only owner to edit:
    if (req.user && String(req.user._id) !== String(doc.userid)) {
      return res.status(403).json({ message: "Not allowed to edit" });
    }

    doc.commentbody = cleaned;
    await doc.save();

    return res.status(200).json({ comment: doc });
  } catch (err) {
    console.error("editcomment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /comment/react/:id
 * body: { type: 'like' | 'dislike' }
 * increments like/dislike counters atomically. Auto soft-delete when dislikes >= THRESHOLD
 */
export const reactComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'like' or 'dislike'
    const VALID = ["like", "dislike"];
    if (!VALID.includes(type)) return res.status(400).json({ message: "Invalid type" });

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ message: "Comment not found" });

    const inc = type === "like" ? { $inc: { likes: 1 } } : { $inc: { dislikes: 1 } };

    const doc = await Comment.findByIdAndUpdate(id, inc, { new: true }).lean();
    if (!doc) return res.status(404).json({ message: "Comment not found" });

    const DISLIKE_THRESHOLD = Number(process.env.DISLIKE_THRESHOLD || 2);

    if (doc.dislikes >= DISLIKE_THRESHOLD && !doc.deleted) {
      await Comment.findByIdAndUpdate(id, { $set: { deleted: true, deletedAt: new Date() } });
      const updated = await Comment.findById(id).lean();
      return res.status(200).json({ comment: updated, autoDeleted: true });
    }

    return res.status(200).json({ comment: doc, autoDeleted: false });
  } catch (err) {
    console.error("reactComment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /comment/translate/:id
 * body: { to: 'en' }
 * returns { translatedText }
 */
export const translateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { to } = req.body;
    if (!to) return res.status(400).json({ message: "Target language required" });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ message: "Comment not found" });

    const doc = await Comment.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Comment not found" });

    const translatedText = await translateText(doc.commentbody, String(to));
    return res.status(200).json({ translatedText });
  } catch (err) {
    console.error("translateComment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
