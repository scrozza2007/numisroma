const { Schema, model } = require('mongoose');

const ConversationSchema = new Schema({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index to optimize queries on participants
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ participants: 1, lastActivity: -1 });

module.exports = model('Conversation', ConversationSchema);
