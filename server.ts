import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { MongoClient, GridFSBucket, ObjectId } from "mongodb";
import multer from "multer";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON body parsing with reasonable size limit
app.use(express.json({ limit: "15mb" }));

// Configure Multer for processing file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB limit
  fileFilter: (req, file, cb) => {
    // Only accept common image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  }
});

// Lazy-loaded MongoDB client and connection state
let mongoClient: MongoClient | null = null;
let dbInstance: any = null;

import crypto from "crypto";

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, hash: string) {
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === verifyHash;
}

async function ensureAdminInDatabase(db: any) {
  try {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!adminUsername || !adminPassword) {
      console.warn("WARNING: ADMIN_USERNAME or ADMIN_PASSWORD is not set in environment variables. Auto-admin profile creation will be skipped.");
      return;
    }

    const usersCollection = db.collection("users");
    const existingAdmin = await usersCollection.findOne({
      username: { $regex: new RegExp(`^${adminUsername}$`, "i") }
    });

    if (!existingAdmin) {
      console.log(`Admin user "${adminUsername}" not found in database. Auto-creating profile...`);
      const { salt, hash } = hashPassword(adminPassword);
      await usersCollection.insertOne({
        username: adminUsername,
        email: adminEmail,
        salt,
        hash,
        createdAt: new Date(),
        isAdmin: true
      });
      console.log(`Admin user "${adminUsername}" successfully added to the "users" collection.`);
    } else {
      console.log(`Admin user "${adminUsername}" already exists in the "users" collection.`);
    }

    // Also pre-create GridFS collections for admin so photos can be saved smoothly
    try {
      const collections = await db.listCollections({ name: `${adminUsername}.files` }).toArray();
      if (collections.length === 0) {
        await db.createCollection(`${adminUsername}.files`);
        await db.createCollection(`${adminUsername}.chunks`);
        console.log(`Created GridFS collections for admin user: ${adminUsername}`);
      }
    } catch (colErr: any) {
      console.warn("GridFS collections pre-creation for admin warning:", colErr.message);
    }

    // Also pre-create GridFS collections for the default base name so it always exists
    try {
      const baseName = process.env.MONGODB_COLLECTION || "Drishya-App";
      const collections = await db.listCollections({ name: `${baseName}.files` }).toArray();
      if (collections.length === 0) {
        await db.createCollection(`${baseName}.files`);
        await db.createCollection(`${baseName}.chunks`);
        console.log(`Created default GridFS collections: ${baseName}`);
      }
    } catch (colErr: any) {
      console.warn("GridFS collections pre-creation for base collection warning:", colErr.message);
    }
  } catch (error) {
    console.error("Error in ensureAdminInDatabase:", error);
  }
}

async function getDB() {
  if (dbInstance) return dbInstance;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri) {
    throw new Error("MONGODB_URI environment variable is missing. Please configure it in your environment settings.");
  }
  if (!dbName) {
    throw new Error("MONGODB_DB environment variable is missing. Please configure it in your environment settings.");
  }

  try {
    console.log("Connecting to MongoDB...");
    mongoClient = new MongoClient(uri, {
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    await mongoClient.connect();
    dbInstance = mongoClient.db(dbName);
    console.log(`Successfully connected to MongoDB: database "${dbName}"`);
    
    // Auto-ensure admin user exists in database and GridFS collections are pre-created
    await ensureAdminInDatabase(dbInstance);

    return dbInstance;
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
}

function getGridFSBucket(db: any, req?: any) {
  const baseName = process.env.MONGODB_COLLECTION || "Drishya-App";
  let username = req ? (req.headers["x-username"] || req.query.username || req.body?.username) : undefined;
  
  const loggedInUser = req ? (req.headers["x-username"] || req.query.username) : undefined;
  const adminUsername = process.env.ADMIN_USERNAME;
  if (adminUsername && loggedInUser === adminUsername && req && (req.query.targetUser || req.headers["x-target-user"])) {
    username = req.query.targetUser || req.headers["x-target-user"];
  }

  const collectionName = username ? username : baseName;
  return new GridFSBucket(db, { bucketName: collectionName });
}

// API: User Signup
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: "Username, password, and email are required." });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const adminUsername = process.env.ADMIN_USERNAME;
    if (adminUsername && trimmedUsername.toLowerCase() === adminUsername.toLowerCase()) {
      return res.status(400).json({ error: "This username is reserved for administrator." });
    }

    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters long." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const db = await getDB();
    const usersCollection = db.collection("users");

    // Check if user exists
    const existingUser = await usersCollection.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") } },
        { email: trimmedEmail }
      ]
    });

    if (existingUser) {
      if (existingUser.email === trimmedEmail) {
        return res.status(400).json({ error: "A user with this email already exists." });
      }
      return res.status(400).json({ error: "Username is already taken." });
    }

    const { salt, hash } = hashPassword(password);

    const newUser = {
      username: trimmedUsername,
      email: trimmedEmail,
      salt,
      hash,
      createdAt: new Date()
    };

    const result = await usersCollection.insertOne(newUser);

    // Ensure user-specific collections are created dynamically inside Photos-Database
    const userCollectionName = trimmedUsername;
    try {
      const collections = await db.listCollections({ name: `${userCollectionName}.files` }).toArray();
      if (collections.length === 0) {
        await db.createCollection(`${userCollectionName}.files`);
        await db.createCollection(`${userCollectionName}.chunks`);
        console.log(`Created GridFS collections for signup user: ${trimmedUsername}`);
      }
    } catch (colErr: any) {
      console.warn("GridFS collections pre-creation warning:", colErr.message);
    }

    res.status(201).json({
      message: "Signup successful!",
      user: {
        id: result.insertedId.toString(),
        username: trimmedUsername,
        email: trimmedEmail
      }
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    res.status(500).json({ error: error.message || "An error occurred during signup." });
  }
});

// API: User Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const trimmedUsername = username.trim();
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminUsername && adminPassword && (trimmedUsername.toLowerCase() === adminUsername.toLowerCase() || trimmedUsername.toLowerCase() === "admin@drishya-app.com")) {
      if (password === adminPassword) {
        return res.json({
          message: "Login successful!",
          user: {
            id: "admin-id",
            username: adminUsername,
            email: "admin@drishya-app.com",
            isAdmin: true
          }
        });
      } else {
        return res.status(401).json({ error: "Invalid username or password." });
      }
    }

    const db = await getDB();
    const usersCollection = db.collection("users");

    // Find by username or email
    const user = await usersCollection.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") } },
        { email: trimmedUsername.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const isMatch = verifyPassword(password, user.salt, user.hash);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // Ensure user-specific collections exist inside Photos-Database on login
    const userCollectionName = user.username;
    try {
      const collections = await db.listCollections({ name: `${userCollectionName}.files` }).toArray();
      if (collections.length === 0) {
        await db.createCollection(`${userCollectionName}.files`);
        await db.createCollection(`${userCollectionName}.chunks`);
        console.log(`Created GridFS collections for login user: ${user.username}`);
      }
    } catch (colErr: any) {
      console.warn("GridFS collections pre-creation on login warning:", colErr.message);
    }

    res.json({
      message: "Login successful!",
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email
      }
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message || "An error occurred during login." });
  }
});

// API: Delete User Account and Associated GridFS collections automatically
app.delete("/api/auth/delete", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required to delete the account." });
    }

    const trimmedUsername = username.trim();

    const db = await getDB();
    const usersCollection = db.collection("users");

    // 1. Delete user document from the users collection
    const deleteUserResult = await usersCollection.deleteOne({
      username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") }
    });

    // 2. Automatically drop the custom user collections storing their photos and chunks
    let dropFilesSuccess = false;
    let dropChunksSuccess = false;
    
    try {
      await db.collection(`${trimmedUsername}.files`).drop();
      dropFilesSuccess = true;
    } catch (colErr: any) {
      console.warn(`Could not drop files collection for ${trimmedUsername}:`, colErr.message);
    }

    try {
      await db.collection(`${trimmedUsername}.chunks`).drop();
      dropChunksSuccess = true;
    } catch (colErr: any) {
      console.warn(`Could not drop chunks collection for ${trimmedUsername}:`, colErr.message);
    }

    res.json({
      message: "Account and photo collections deleted successfully!",
      deletedCount: deleteUserResult.deletedCount,
      photoCollectionsCleaned: {
        files: dropFilesSuccess,
        chunks: dropChunksSuccess
      }
    });
  } catch (error: any) {
    console.error("Account deletion error:", error);
    res.status(500).json({ error: error.message || "An error occurred during account deletion." });
  }
});

// API: Admin - Get All Registered User Details and Photo Counts
app.get("/api/admin/users", async (req, res) => {
  try {
    const loggedInUser = req.headers["x-username"];
    const adminUsername = process.env.ADMIN_USERNAME;

    if (!adminUsername || loggedInUser !== adminUsername) {
      return res.status(403).json({ error: "Access denied. Only the system administrator can perform this action." });
    }

    const db = await getDB();
    const usersCollection = db.collection("users");
    const users = await usersCollection.find({}).sort({ createdAt: -1 }).toArray();

    const userDetailsList = [];
    for (const u of users) {
      const filesCollection = db.collection(`${u.username}.files`);
      const photoCount = await filesCollection.countDocuments({});
      userDetailsList.push({
        id: u._id.toString(),
        username: u.username,
        email: u.email,
        createdAt: u.createdAt || new Date(),
        photoCount
      });
    }

    res.json({ users: userDetailsList });
  } catch (error: any) {
    console.error("Admin fetch users error:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve user details." });
  }
});

// API: Forgot Password (Request verification code)
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const db = await getDB();
    const usersCollection = db.collection("users");

    // Check if user exists
    const user = await usersCollection.findOne({ email: trimmedEmail });
    if (!user) {
      return res.status(404).json({ error: "No account found with this email address." });
    }

    // Generate a 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // Valid for 15 minutes

    // Save to user document
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { resetCode, resetCodeExpires } }
    );

    console.log(`[PASSWORD RESET] Generated reset code ${resetCode} for ${trimmedEmail}`);

    // Check if SMTP is configured
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    let emailSent = false;
    let emailError = null;

    if (smtpHost && smtpPort && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort, 10),
          secure: parseInt(smtpPort, 10) === 465, // true for 465, false for other ports
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const mailOptions = {
          from: process.env.SMTP_FROM || "noreply@drishya-app.com",
          to: trimmedEmail,
          subject: "Reset your Drishya-App Password",
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
              <h2 style="color: #4f46e5; margin-bottom: 20px; font-weight: bold;">Drishya-App</h2>
              <p>You requested a password reset for your account (Username: <strong>${user.username}</strong>).</p>
              <p>Use the following 6-digit verification code to reset your password. This code will expire in 15 minutes.</p>
              <div style="background-color: #e2e8f0; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 8px; margin: 20px 0; color: #1e293b;">
                ${resetCode}
              </div>
              <p style="color: #64748b; font-size: 12px; margin-top: 30px;">If you did not make this request, you can safely ignore this email.</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        emailSent = true;
      } catch (err: any) {
        console.error("Nodemailer failed to send email:", err);
        emailError = err.message;
      }
    }

    // In development or if SMTP is not configured, we return the code in a special field for testing
    const devMode = !emailSent;
    res.json({
      message: emailSent 
        ? "Verification code sent to your email address." 
        : "A reset code has been logged to the console (SMTP is not configured).",
      emailSent,
      devMode,
      // Only include code if SMTP is not configured, so they can test/prototype instantly in AI Studio!
      code: devMode ? resetCode : undefined,
      emailError
    });

  } catch (error: any) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: error.message || "An error occurred during password recovery." });
  }
});

// API: Reset Password
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, reset code, and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    const db = await getDB();
    const usersCollection = db.collection("users");

    // Find the user with matching email and non-expired reset code
    const user = await usersCollection.findOne({
      email: trimmedEmail,
      resetCode: trimmedCode,
      resetCodeExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification code." });
    }

    // Hash the new password
    const { salt, hash } = hashPassword(newPassword);

    // Update password and clear resetCode fields
    await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { salt, hash },
        $unset: { resetCode: "", resetCodeExpires: "" }
      }
    );

    res.json({ message: "Password reset successful! You can now log in with your new password." });

  } catch (error: any) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: error.message || "An error occurred while resetting your password." });
  }
});

// Ensure the database connection works
app.get("/api/health", async (req, res) => {
  try {
    const db = await getDB();
    const collectionName = process.env.MONGODB_COLLECTION || "Drishya-App";
    const status = await db.command({ ping: 1 });
    res.json({
      status: "ok",
      database: db.databaseName,
      collection: collectionName,
      ping: status
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to connect to MongoDB database."
    });
  }
});

// API: Get all Photos (only retrieves metadata and _id, avoiding heavy binary loads)
app.get("/api/photos", async (req, res) => {
  try {
    const db = await getDB();
    let username = req.headers["x-username"] || req.query.username;
    
    // Admin bypass: fetch targeted user's photos if requested
    const loggedInUser = req.headers["x-username"] || req.query.username;
    const adminUsername = process.env.ADMIN_USERNAME;
    if (adminUsername && loggedInUser === adminUsername && (req.query.targetUser || req.headers["x-target-user"])) {
      username = req.query.targetUser || (req.headers["x-target-user"] as string);
    }

    const baseName = process.env.MONGODB_COLLECTION || "Drishya-App";
    const collectionName = username ? username : baseName;
    const filesCollection = db.collection(`${collectionName}.files`);

    // Find and sort files from GridFS
    const files = await filesCollection
      .find({})
      .sort({ "metadata.uploadedAt": -1 })
      .toArray();

    const photos = files.map((file) => ({
      id: file._id.toString(),
      filename: file.filename,
      length: file.length,
      contentType: file.metadata?.contentType || file.contentType || "image/jpeg",
      uploadDate: file.uploadDate,
      metadata: file.metadata || {}
    }));

    res.json({ photos });
  } catch (error: any) {
    console.error("Error fetching photos metadata:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve photos metadata." });
  }
});

// API: Stream/Download image binary from GridFS
app.get("/api/photos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid photo ID." });
    }

    const db = await getDB();
    const bucket = getGridFSBucket(db, req);
    const objectId = new ObjectId(id);

    // Verify if the file exists first
    let username = req.headers["x-username"] || req.query.username;
    
    const loggedInUser = req.headers["x-username"] || req.query.username;
    const adminUsername = process.env.ADMIN_USERNAME;
    if (adminUsername && loggedInUser === adminUsername && (req.query.targetUser || req.headers["x-target-user"])) {
      username = req.query.targetUser || (req.headers["x-target-user"] as string);
    }

    const baseName = process.env.MONGODB_COLLECTION || "Drishya-App";
    const collectionName = username ? username : baseName;
    const filesCollection = db.collection(`${collectionName}.files`);
    const file = await filesCollection.findOne({ _id: objectId });

    if (!file) {
      return res.status(404).json({ error: "Photo not found in database." });
    }

    // Set appropriate headers
    res.set("Content-Type", file.metadata?.contentType || file.contentType || "image/jpeg");
    res.set("Content-Length", file.length.toString());
    res.set("Cache-Control", "public, max-age=31536000"); // Cache static uploaded images

    const downloadStream = bucket.openDownloadStream(objectId);

    downloadStream.on("error", (err) => {
      console.error("GridFS streaming error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error streaming image data from GridFS." });
      }
    });

    downloadStream.pipe(res);
  } catch (error: any) {
    console.error("Error retrieving photo:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to stream photo binary." });
    }
  }
});

// API: Upload photo and save to MongoDB using GridFS
app.post("/api/photos", (req, res) => {
  upload.single("photo")(req, res, async (err) => {
    if (err) {
      console.error("Multer file upload error:", err);
      return res.status(400).json({ error: err.message || "Multer upload failed." });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided in 'photo' field." });
      }

      const { title, description, lat, lng } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({ error: "Geographic coordinates (latitude and longitude) are required." });
      }

      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);

      if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        return res.status(400).json({ error: "Latitude must be a valid number between -90 and 90." });
      }
      if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "Longitude must be a valid number between -180 and 180." });
      }

      const db = await getDB();
      const bucket = getGridFSBucket(db, req);

      const cleanedTitle = title ? title.trim() : "Untitled Photo";
      const ext = path.extname(req.file.originalname) || "";
      const filename = ext && !cleanedTitle.toLowerCase().endsWith(ext.toLowerCase()) 
        ? `${cleanedTitle}${ext}` 
        : cleanedTitle;
      
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          title: title ? title.trim() : "Untitled Photo",
          description: description ? description.trim() : "",
          lat: latitude,
          lng: longitude,
          contentType: req.file.mimetype,
          uploadedAt: new Date()
        }
      });

      uploadStream.on("error", (uploadError) => {
        console.error("GridFS Upload Stream Error:", uploadError);
        if (!res.headersSent) {
          res.status(500).json({ error: "GridFS write failure. Could not store image." });
        }
      });

      uploadStream.on("finish", () => {
        console.log(`Successfully stored file to GridFS with ID: ${uploadStream.id}`);
        if (!res.headersSent) {
          res.status(201).json({
            message: "Photo uploaded and saved successfully!",
            photo: {
              id: uploadStream.id.toString(),
              filename,
              contentType: req.file?.mimetype,
              metadata: {
                title: title ? title.trim() : "Untitled Photo",
                description: description ? description.trim() : "",
                lat: latitude,
                lng: longitude,
                uploadedAt: new Date()
              }
            }
          });
        }
      });

      // Write the buffer to GridFS bucket stream directly
      uploadStream.write(req.file.buffer);
      uploadStream.end();

    } catch (error: any) {
      console.error("Server exception inside file upload route:", error);
      res.status(500).json({ error: error.message || "An unexpected server error occurred." });
    }
  });
});

// API: Delete photo and chunks from GridFS
app.delete("/api/photos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid photo ID." });
    }

    const db = await getDB();
    const bucket = getGridFSBucket(db, req);
    const objectId = new ObjectId(id);

    // Verify if the file exists
    let username = req.headers["x-username"] || req.query.username;
    
    const loggedInUser = req.headers["x-username"] || req.query.username;
    const adminUsername = process.env.ADMIN_USERNAME;
    if (adminUsername && loggedInUser === adminUsername && (req.query.targetUser || req.headers["x-target-user"])) {
      username = req.query.targetUser || (req.headers["x-target-user"] as string);
    }

    const baseName = process.env.MONGODB_COLLECTION || "Drishya-App";
    const collectionName = username ? username : baseName;
    const filesCollection = db.collection(`${collectionName}.files`);
    const file = await filesCollection.findOne({ _id: objectId });

    if (!file) {
      return res.status(404).json({ error: "Photo not found to delete." });
    }

    // Delete file and corresponding chunks
    await bucket.delete(objectId);
    console.log(`Successfully deleted GridFS file with ID: ${id}`);
    res.json({ message: "Photo deleted successfully from database." });
  } catch (error: any) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ error: error.message || "Failed to delete photo from database." });
  }
});

async function startServer() {
  // Vite middleware for development vs static asset serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Geo Photo Map Backend] Server listening at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal server initialization error:", err);
});
