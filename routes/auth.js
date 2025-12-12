import express from "express";
import { dispatchOtp, login, updateprofile } from "../controllers/auth.js";
const routes = express.Router();

routes.post("/login", login);
routes.post("/otp/dispatch", dispatchOtp);
routes.patch("/update/:id", updateprofile);
export default routes;
