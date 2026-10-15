import { intents } from '../data/intents';

class PetNLPEngine {
  constructor(intentsData) {
    this.intents = intentsData;
    this.vocabulary = new Set();
    this.intentVectors = [];
    this.idfWeights = {}; 
    
    this.stopWords = new Set([
      "the", "a", "an", "is", "are", "do", "will", "what", "how", "my", "i", "to", "for",
      "with", "and", "of", "in", "it", "this", "that", "on", "at", "by", "has", "have",
      "can", "could", "would", "should", "not", "why", "who", "does", "did", "about",
      "really", "very", "just", "so", "some", "any", "from",
      "please", "help", "me", "tell", "know", "someone", "anyone", "advice", "wondering"
    ]);

    // Added specific medical catch-all terms
    this.medicalKeywords = new Set([
      "sick", "pain", "hurt", "vet", "doctor", "bleeding", "blood", "emergency", 
      "dying", "swollen", "lump", "tumor", "cancer", "infection", "bitten", "rabies"
    ]);

    this.synonyms = {
      "pup": "dog", "puppy": "dog", "canine": "dog", "hound": "dog", "doggy": "dog",
      "kitty": "cat", "kitten": "cat", "feline": "cat",
      "ill": "sick", "illness": "sick", "disease": "sick", "unwell": "sick",
      "diet": "food", "meal": "food", "kibble": "food", 
      "veterinarian": "vet", "clinic": "vet", "hospital": "vet",
      "feces": "poop", "stool": "poop", "diarrhea": "poop",
      "urine": "pee", "peeing": "pee",
      "puke": "vomit", "puking": "vomit", "vomits": "vomit", "barf": "vomit", "barfing": "vomit",
      "lethargy": "tired", "lethargic": "tired", "exhausted": "tired", "weak": "tired", "lazy": "tired",
      "aggression": "aggressive", "bite": "aggressive", "biting": "aggressive", "growl": "aggressive", "growling": "aggressive", "snap": "aggressive", "snapping": "aggressive",
      "bark": "barking", "barks": "barking", "noisy": "barking"
    };

    this.train();
  }

  // Pre-process n-grams (multi-keyword mapping)
  preprocessNgrams(text) {
    let lower = text.toLowerCase();
    // specific combinations map to unique single strong tokens
    lower = lower.replace(/not eating/g, "loss_appetite");
    lower = lower.replace(/won't eat/g, "loss_appetite");
    lower = lower.replace(/refuses to eat/g, "loss_appetite");
    lower = lower.replace(/no appetite/g, "loss_appetite");
    lower = lower.replace(/throw up/g, "vomit");
    lower = lower.replace(/throwing up/g, "vomit");
    lower = lower.replace(/threw up/g, "vomit");
    lower = lower.replace(/heat stroke/g, "heatstroke");
    lower = lower.replace(/kennel cough/g, "kennel_cough");
    lower = lower.replace(/take care of/g, "care");
    lower = lower.replace(/look after/g, "care");
    lower = lower.replace(/how to watch/g, "care");
    return lower;
  }

  tokenize(text) {
    if (!text) return [];
    const nGramProcessed = this.preprocessNgrams(text);
    const cleanText = nGramProcessed.replace(/[^\w\s]|_/g, "");
    const tokens = cleanText.split(/\s+/).filter(t => t.length > 0);
    
    return tokens
      .filter(t => !this.stopWords.has(t))
      .map(t => {
        let base = t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t;
        return this.synonyms[base] || base;
      });
  }

  train() {
    const rawDocuments = []; 
    
    this.intents.forEach(intent => {
      let tokensForIntent = [];
      intent.patterns.forEach(pattern => {
        const tokens = this.tokenize(pattern);
        tokens.forEach(t => {
          this.vocabulary.add(t);
          tokensForIntent.push(t);
        });
      });
      rawDocuments.push(tokensForIntent);
    });

    this.vocabArray = Array.from(this.vocabulary);
    const N = rawDocuments.length;

    this.vocabArray.forEach(term => {
      let docCountWithTerm = 0;
      rawDocuments.forEach(docTokens => {
        if (docTokens.includes(term)) { docCountWithTerm++; }
      });
      this.idfWeights[term] = Math.log(N / (1 + docCountWithTerm));
    });

    this.intentVectors = rawDocuments.map(tokens => this.vectorize(tokens));
  }

  vectorize(tokens) {
    const vector = new Array(this.vocabArray.length).fill(0);
    const tokenCounts = {};
    tokens.forEach(token => { tokenCounts[token] = (tokenCounts[token] || 0) + 1; });

    Object.keys(tokenCounts).forEach(token => {
      const idx = this.vocabArray.indexOf(token);
      if (idx !== -1) {
        vector[idx] = tokenCounts[token] * (this.idfWeights[token] || 0);
      }
    });
    return vector;
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getIntent(text) {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return null;

    const inputVector = this.vectorize(tokens);

    let maxScore = -1;
    let bestIntent = null;

    for (let i = 0; i < this.intents.length; i++) {
      const score = this.cosineSimilarity(inputVector, this.intentVectors[i]);
      if (score > maxScore) {
        maxScore = score;
        bestIntent = this.intents[i];
      }
    }

    // Better Thresholding (Wait for score to be slightly higher, e.g. 0.25)
    if (maxScore > 0.25 && bestIntent) {
      let responseMsg = bestIntent.response;
      
      // Safety Layer: Global Medical Disclaimer on explicit Medical Intents
      if (bestIntent.isMedical) {
        responseMsg += "\n\n⚠️ *If symptoms persist or worsen, please consult a veterinarian immediately.*";
      }

      return { response: responseMsg, score: maxScore, id: bestIntent.id };
    }
    
    // MID-CONFIDENCE GENERAL MEDICAL FALLBACK
    // If the score was too low to match an exact disease, but the user used critical medical words
    const hasMedicalKeyword = tokens.some(t => this.medicalKeywords.has(t) || this.synonyms[t] === "sick");
    if (hasMedicalKeyword) {
      return {
        response: "I notice you're asking about a potential health issue, but I'm not entirely sure exactly what the condition is. 🐾 As a general rule, ensure they are resting in a safe, quiet space and have access to water. \n\n⚠️ *If they are showing severe symptoms (trouble breathing, extreme lethargy, uncontrollable vomiting or bleeding), this is an emergency and you should immediately consult a veterinarian!*",
        score: maxScore,
        id: "general_medical_fallback"
      };
    }

    return null; // Absolute fallback for irrelevant non-medical queries
  }
}

export const nlpEngine = new PetNLPEngine(intents);
