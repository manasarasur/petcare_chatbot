import React, { useState, useEffect, useRef } from 'react';
import { PawPrint, Send, Cat, Bone } from 'lucide-react';
import './App.css';
import './markdown.css';
function App() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      text: "Hi! I'm your Pet Care Buddy 🐶🐱 Ask me anything about your pet!",
      sender: 'bot'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const renderMarkdown = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      // Parse bold **text**
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const elements = parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });
      return (
        <p key={i} style={{ margin: line.trim() === '' ? '4px 0' : '0 0 8px 0' }}>
          {elements}
        </p>
      );
    });
  };

  const handleSend = async (textInput) => {
    const text = textInput || input;
    if (!text.trim()) return;

    // Add user message
    const userMsg = { id: Date.now().toString(), text, sender: 'user' };
    
    // Create new array with user message to pass to state immediately
    const allMessages = [...messages, userMsg];
    
    setMessages(allMessages);
    setInput('');
    setIsTyping(true);

    try {
      // Send chat history and current message to Python backend
      const response = await fetch('http://127.0.0.1:5000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          history: messages 
        }),
      });

      const data = await response.json();
      
      const botResponseText = response.ok ? data.response : (data.response || "Sorry, I had an issue connecting to the server.");

      const botMsg = { id: (Date.now() + 1).toString(), text: botResponseText, sender: 'bot' };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
       console.error("Chat API error:", error);
       const errorMsg = { id: (Date.now() + 1).toString(), text: "I couldn't reach my AI backend server. Please make sure the Python server is running on port 5000!", sender: 'bot' };
       setMessages(prev => [...prev, errorMsg]);
    } finally {
       setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <div className="chat-header">
        <div className="header-icon-container">
          <PawPrint size={28} color="white" />
        </div>
        <div className="header-text">
          <h1>Pet Care Buddy</h1>
          <p>Your 24/7 Virtual Vet Assistant</p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="chat-window">
        {messages.map((msg) => (
          <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
            <div className={`message-avatar ${msg.sender}`}>
              {msg.sender === 'bot' ? <Cat size={18} /> : <Bone size={16} />}
            </div>
            <div className="message-bubble">
              {msg.sender === 'bot' ? (
                <div className="markdown-content">{renderMarkdown(msg.text)}</div>
              ) : (
                <div className="user-message-content">
                  <div className="message-text">{msg.text}</div>
                </div>
              )}
              {msg.id === 'welcome' && (
                <div className="suggestions-container">
                  <button className="suggestion-chip" onClick={() => handleSend("What do dogs eat daily?")}>Diet</button>
                  <button className="suggestion-chip" onClick={() => handleSend("How to stop puppy from barking?")}>Training</button>
                  <button className="suggestion-chip" onClick={() => handleSend("Is chocolate toxic?")}>Safety</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="message-wrapper bot">
            <div className="message-avatar bot">
              <Cat size={18} />
            </div>
            <div className="message-bubble">
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-container">
        <div className="input-form">
          <input
            type="text"
            className="chat-input"
            placeholder="Ask about dog food, vaccinations, etc..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
            autoFocus
          />
          <button 
            className="send-button"
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
