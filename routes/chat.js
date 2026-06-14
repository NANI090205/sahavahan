const express = require("express");
const router = express.Router();


const Message = require("../models/Message");
const { createNotification } = require("../utils/notifications");

// Send Message
router.post("/send", async (req, res) => {

    try {

        const {
            sender,
            receiver,
            message
        } = req.body;

        if (
            !sender ||
            !receiver ||
            !message ||
            receiver === "undefined" ||
            sender === receiver
        ) {
            return res.status(400).json({
                message: "Invalid chat message"
            });
        }

        const newMessage = new Message({
            sender,
            receiver,
            message
        });

        await newMessage.save();

        await createNotification({
            username: receiver,
            title: "💬 New Message",
            message: `${sender} sent you a message`,
            type: "message"
        });

        res.status(200).json({
            message: "Message sent successfully"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to send message"
        });

    }

});

router.get(
  "/unread/:username",
  async (req, res) => {

    try {

      const count =
        await Message.countDocuments({
          receiver:
            req.params.username,
          read: false
        });

      res.json({
        unread: count
      });

    } catch (error) {

      res.status(500).json({
        unread: 0
      });

    }

  }
);

// Get Messages
router.get("/:sender/:receiver", async (req, res) => {

    try {

        const {
            sender,
            receiver
        } = req.params;

        if (
            !sender ||
            !receiver ||
            receiver === "undefined" ||
            sender === receiver
        ) {
            return res.status(400).json({
                message: "Invalid chat users"
            });
        }

        const messages = await Message.find({
            $or: [
                {
                    sender,
                    receiver
                },
                {
                    sender: receiver,
                    receiver: sender
                }
            ]
        }).sort({
            createdAt: 1
        });

        await Message.updateMany(
            {
                sender: receiver,
                receiver: sender,
                read: false
            },
            {
                read: true
            }
        );

        res.json(messages);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Failed to fetch messages"
        });

    }

});

module.exports = router;
