const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');
const { body } = require('express-validator')
const { requireTrustedOrigin, requireSession, requireAdminSession } = require('../middleware/sessionCookie')
const { listAdminAccess, saveStudentAccess } = require('../services/studentAccess');


//note a middleware to be created later in the future for the admin 

// this route is the register for the admin and login for the admin
router.post('/admin/login', requireTrustedOrigin, adminController.login)

router.get('/admin/student-access', requireTrustedOrigin, requireSession, requireAdminSession, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.status(200).json(await listAdminAccess());
  } catch (error) {
    console.error("Failed to load student course and quiz access:", error.message);
    return res.status(503).json({ message: "Student access could not be loaded." });
  }
});

router.put('/admin/student-access', requireTrustedOrigin, requireSession, requireAdminSession, async (req, res) => {
  try {
    const access = await saveStudentAccess(req.body?.email, req.body?.resourceIds);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ message: "Student access saved.", access });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error("Failed to save student course and quiz access:", error.message);
    return res.status(503).json({ message: "Student access could not be saved." });
  }
});

module.exports = router;
