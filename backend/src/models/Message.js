const { Schema, model } = require('mongoose');

const MessageSchema = new Schema({
  conversation: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [5000, 'Message content cannot exceed 5000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image'],
    default: 'text'
  },
  imageUrl: {
    type: String,
    maxlength: [2000, 'Image URL cannot exceed 2000 characters']
  },
  readBy: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes to optimize common query paths:
//  - list messages in a conversation (chronological)
//  - count/load messages a user sent (profile delete, reports)
//  - mark-as-read / unread-count filters that include `isDeleted` and
//    `sender` alongside the conversation id
MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ conversation: 1, sender: 1, isDeleted: 1 });

module.exports = model('Message', MessageSchema);
