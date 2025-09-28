"""
AgroTrack-Lite Backend with AI Agents
AI + DePIN Agricultural Marketplace for Hedera Africa Hackathon
"""

from hedera import (
    Client, 
    PrivateKey, 
    AccountId,
    TopicCreateTransaction,
    TopicMessageSubmitTransaction,
    TokenCreateTransaction,
    TokenType,
    TransferTransaction,
    Hbar
)
import json
from datetime import datetime
import uuid
from typing import Dict, List
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# AI Agent imports
try:
    from langchain_community.llms import OpenAI
except ImportError:
    from langchain.llms import OpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain


class MarketMatchingAgent:
    """AI Agent for matching farmers with best buyers"""
    
    def __init__(self, llm):
        self.llm = llm
        
        # Define the matching prompt
        self.prompt = PromptTemplate(
            input_variables=["crop", "quantity", "location", "buyers"],
            template="""You are an agricultural market-matching AI agent.
            
Given:
- Crop: {crop}
- Quantity: {quantity}
- Location: {location}
- Available Buyers: {buyers}

Analyze and rank the buyers based on:
1. Geographic proximity to farmer
2. Buyer capacity and current demand
3. Historical reliability score
4. Price competitiveness

Return ONLY the name of the best matched buyer and a brief reason (max 20 words).
Format: BUYER_NAME | REASON

Your response:"""
        )
        
        self.chain = LLMChain(llm=self.llm, prompt=self.prompt)
    
    def match(self, crop: str, quantity: str, location: str, buyers: List[Dict]) -> Dict:
        """Find best buyer match"""
        
        # Format buyers for LLM
        buyers_str = "\n".join([
            f"- {b['name']} ({b['location']}, {b['distance_km']}km away, reliability: {b['reliability_score']}/100)"
            for b in buyers
        ])
        
        # Run the matching chain
        result = self.chain.run(
            crop=crop,
            quantity=quantity,
            location=location,
            buyers=buyers_str
        )
        
        # Parse result
        parts = result.split("|")
        matched_buyer = parts[0].strip()
        reason = parts[1].strip() if len(parts) > 1 else "Best match based on analysis"
        
        # Find the full buyer object
        buyer_obj = next((b for b in buyers if b['name'] == matched_buyer), buyers[0])
        
        return {
            "buyer": buyer_obj,
            "reason": reason,
            "algorithm": "llm_proximity_reliability_v1"
        }


class PricingAgent:
    """AI Agent for fair price calculation and logistics optimization"""
    
    def __init__(self, llm):
        self.llm = llm
        
        self.prompt = PromptTemplate(
            input_variables=["crop", "quantity", "location", "season", "market_data"],
            template="""You are an agricultural pricing AI agent for East Africa.

Given:
- Crop: {crop}
- Quantity: {quantity}
- Location: {location}
- Current Season: {season}
- Recent Market Data: {market_data}

Calculate a fair price per kg in Kenyan Shillings (KES) considering:
1. Current market rates
2. Seasonal variations
3. Quality expectations
4. Transportation costs
5. Supply/demand dynamics

Return ONLY a number representing price per kg.
Your response (number only):"""
        )
        
        self.chain = LLMChain(llm=self.llm, prompt=self.prompt)
    
    def calculate_price(self, crop: str, quantity: str, location: str) -> Dict:
        """Calculate fair price"""
        
        # Mock market data (in production, pull from real APIs)
        market_data = {
            "maize": "Recent avg: KES 42-48/kg, trending stable",
            "beans": "Recent avg: KES 110-130/kg, high demand",
            "tomatoes": "Recent avg: KES 55-65/kg, seasonal peak",
            "potatoes": "Recent avg: KES 30-40/kg, oversupply"
        }
        
        season = "Harvest season (March)" if datetime.now().month in [3,4,5] else "Planting season"
        
        # Get LLM price prediction
        price_str = self.chain.run(
            crop=crop.lower(),
            quantity=quantity,
            location=location,
            season=season,
            market_data=market_data.get(crop.lower(), "No recent data")
        ).strip()
        
        # Parse price (fallback to base prices if parsing fails)
        try:
            price_per_kg = float(price_str)
        except:
            base_prices = {"maize": 45, "beans": 120, "tomatoes": 60, "potatoes": 35}
            price_per_kg = base_prices.get(crop.lower(), 50)
        
        # Calculate logistics
        qty_num = float(quantity.replace("kg", "").strip())
        total_price = price_per_kg * qty_num
        
        return {
            "price_per_kg": price_per_kg,
            "total_price": round(total_price, 2),
            "currency": "KES",
            "market_conditions": season,
            "algorithm": "llm_market_seasonal_v1"
        }


class RiskScoringAgent:
    """AI Agent for counterparty risk assessment"""
    
    def __init__(self, llm):
        self.llm = llm
        
        self.prompt = PromptTemplate(
            input_variables=["party_id", "transaction_history"],
            template="""You are a risk assessment AI agent for agricultural trades.

Given transaction history for party {party_id}:
{transaction_history}

Assess the risk level (0-100, where 0 is no risk, 100 is maximum risk) based on:
1. Payment reliability
2. Delivery consistency
3. Dispute frequency
4. Transaction completion rate

Return ONLY a number between 0-100 and a one-line reason.
Format: SCORE | REASON

Your response:"""
        )
        
        self.chain = LLMChain(llm=self.llm, prompt=self.prompt)
    
    def score_risk(self, party_id: str, history: List[Dict]) -> Dict:
        """Calculate risk score"""
        
        if not history:
            return {
                "risk_score": 15,
                "risk_level": "low",
                "reason": "New user with no transaction history",
                "recommendation": "proceed_with_caution"
            }
        
        # Format history for LLM
        history_str = "\n".join([
            f"- {h['date']}: {h['crop']} trade, status: {h['status']}, amount: {h['amount']}"
            for h in history[-10:]  # Last 10 transactions
        ])
        
        result = self.chain.run(
            party_id=party_id,
            transaction_history=history_str
        )
        
        # Parse result
        parts = result.split("|")
        risk_score = int(parts[0].strip())
        reason = parts[1].strip() if len(parts) > 1 else "Based on transaction history"
        
        # Determine risk level
        if risk_score < 30:
            risk_level = "low"
            recommendation = "proceed"
        elif risk_score < 60:
            risk_level = "medium"
            recommendation = "proceed_with_caution"
        else:
            risk_level = "high"
            recommendation = "require_additional_verification"
        
        return {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "reason": reason,
            "recommendation": recommendation,
            "algorithm": "llm_history_analysis_v1"
        }


class AutonomousSettlementAgent:
    """
    AI Agent that autonomously releases escrow by executing Hedera transactions
    
    Key Features:
    1. Queries HCS for transaction history
    2. Makes autonomous decisions using LLM
    3. Executes HSCS escrow release without human intervention
    4. Logs decisions back to HCS
    """
    
    def __init__(self, llm, hedera_client, hcs_topic_id, escrow_token_id):
        self.llm = llm
        self.client = hedera_client
        self.hcs_topic_id = hcs_topic_id
        self.escrow_token_id = escrow_token_id
        
        # Decision-making prompt
        self.decision_prompt = PromptTemplate(
            input_variables=["otp_match", "weight_variance", "grade", "buyer_history", "farmer_history"],
            template="""You are an autonomous settlement agent for agricultural trades.

Given the following conditions for a delivery confirmation:
- OTP Match: {otp_match}
- Weight Variance: {weight_variance}% from expected
- Quality Grade: {grade}
- Buyer Reliability History: {buyer_history}
- Farmer Reliability History: {farmer_history}

Decide if this trade should be automatically settled (escrow released) or if it requires human review.

Rules for AUTO-SETTLEMENT:
1. OTP must match exactly
2. Weight variance must be ≤ 5%
3. Grade must be B or better
4. If buyer has <80% reliability, require review
5. If weight variance 3-5%, reduce payout proportionally

Return your decision in this exact format:
DECISION: [AUTO_SETTLE or REQUIRE_REVIEW]
CONFIDENCE: [0.0 to 1.0]
ADJUSTMENT: [percentage adjustment to payment, 0-100]
REASON: [one sentence explanation]

Your response:"""
        )
        
        self.chain = LLMChain(llm=self.llm, prompt=self.decision_prompt)
    
    def query_hcs_history(self, party_id: str, event_types: List[str] = None) -> List[Dict]:
        """Query HCS topic for historical transactions involving this party"""
        print(f"   Agent querying HCS for {party_id} history...")
        
        # Simulate HCS query for demo (in production, query real HCS)
        messages = [
            {
                "timestamp": "2025-03-10T10:00:00Z",
                "event_type": "PAYOUT_COMPLETED",
                "data": {"buyer_id": party_id, "status": "completed"}
            },
            {
                "timestamp": "2025-03-12T14:30:00Z",
                "event_type": "PAYOUT_COMPLETED",
                "data": {"buyer_id": party_id, "status": "completed"}
            }
        ]
        
        print(f"   Found {len(messages)} relevant HCS events")
        return messages
    
    def calculate_reliability_score(self, history: List[Dict]) -> float:
        """Calculate reliability from HCS history"""
        if not history:
            return 50.0
        
        completed = sum(1 for h in history if h.get('data', {}).get('status') == 'completed')
        total = len(history)
        
        return (completed / total * 100) if total > 0 else 50.0
    
    def autonomous_settlement_decision(
        self, 
        trade_id: str,
        otp: str,
        expected_otp: str,
        actual_weight: float,
        expected_weight: float,
        grade: str,
        buyer_id: str,
        farmer_phone: str
    ) -> Dict:
        """Make autonomous decision about settlement"""
        
        print(f"\n   Autonomous Agent analyzing trade {trade_id}...")
        
        # Verify conditions
        otp_match = (str(otp) == str(expected_otp))
        weight_variance = abs(actual_weight - expected_weight) / expected_weight * 100
        
        # Query HCS for historical data (AUTONOMOUS BLOCKCHAIN READ)
        buyer_history = self.query_hcs_history(buyer_id, ["PAYOUT_COMPLETED"])
        farmer_history = self.query_hcs_history(farmer_phone, ["FARMER_REQUEST"])
        
        buyer_reliability = self.calculate_reliability_score(buyer_history)
        farmer_reliability = self.calculate_reliability_score(farmer_history)
        
        print(f"   OTP Match: {otp_match}, Weight Variance: {weight_variance:.1f}%")
        print(f"   Buyer Reliability: {buyer_reliability:.0f}%, Farmer Reliability: {farmer_reliability:.0f}%")
        
        # AI makes the decision
        decision_result = self.chain.run(
            otp_match=str(otp_match),
            weight_variance=f"{weight_variance:.1f}",
            grade=grade,
            buyer_history=f"{len(buyer_history)} txns, {buyer_reliability:.0f}% reliable",
            farmer_history=f"{len(farmer_history)} txns, {farmer_reliability:.0f}% reliable"
        )
        
        # Parse AI decision
        lines = decision_result.strip().split('\n')
        decision_dict = {}
        for line in lines:
            if ':' in line:
                key, value = line.split(':', 1)
                decision_dict[key.strip()] = value.strip()
        
        decision = decision_dict.get('DECISION', 'REQUIRE_REVIEW')
        confidence = float(decision_dict.get('CONFIDENCE', '0.5'))
        adjustment = float(decision_dict.get('ADJUSTMENT', '100'))
        reason = decision_dict.get('REASON', 'Decision made by AI agent')
        
        print(f"   AI Decision: {decision} (confidence: {confidence:.0%})")
        print(f"   Payment Adjustment: {adjustment:.0f}%")
        
        return {
            "decision": decision,
            "confidence": confidence,
            "adjustment": adjustment / 100,
            "reason": reason,
            "autonomous": True
        }
    
    def execute_autonomous_settlement(
        self,
        trade_id: str,
        farmer_phone: str,
        escrow_amount: int,
        adjustment: float
    ) -> Dict:
        """Autonomously execute the escrow release on Hedera"""
        
        print(f"\n   Agent autonomously executing settlement...")
        
        final_amount = int(escrow_amount * adjustment)
        
        # Simulate transaction (in production, actual HTS transfer)
        tx_id = f"0.0.{self.escrow_token_id}@{int(datetime.utcnow().timestamp())}.{trade_id[:8]}"
        
        print(f"   Transferred {final_amount} ATES tokens to {farmer_phone}")
        print(f"   Transaction ID: {tx_id}")
        
        return {
            "success": True,
            "tx_id": tx_id,
            "amount": final_amount,
            "autonomous_execution": True
        }


class AgroTrackBackend:
    def __init__(self, network: str = None):
        """
        Initialize Hedera client and AI agents
        Loads all credentials from .env file
        """
        # Get the directory where this script is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        env_path = os.path.join(script_dir, '.env')
        
        # Force reload environment variables from the correct path
        load_dotenv(dotenv_path=env_path, override=True)
        
        # Load credentials from environment variables
        hedera_account = os.getenv('HEDERA_ACCOUNT_ID')
        hedera_key = os.getenv('HEDERA_PRIVATE_KEY')
        network = network or os.getenv('HEDERA_NETWORK', 'testnet')
        
        # Validate credentials
        if not hedera_account:
            raise ValueError(
                "\n ERROR: HEDERA_ACCOUNT_ID not found in .env file!\n"
                f"Looked for .env at: {env_path}\n"
                "Please add HEDERA_ACCOUNT_ID to your .env file.\n"
            )
        
        if not hedera_key:
            raise ValueError(
                "\n ERROR: HEDERA_PRIVATE_KEY not found in .env file!\n"
                "Please add HEDERA_PRIVATE_KEY to your .env file.\n"
            )
        
        self.operator_id = AccountId.fromString(hedera_account)
        self.operator_key = PrivateKey.fromString(hedera_key)
        
        # Initialize Hedera client
        if network == "testnet":
            self.client = Client.forTestnet()
        else:
            self.client = Client.forMainnet()
            
        self.client.setOperator(self.operator_id, self.operator_key)
        
        # Get OpenAI key from environment
        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        
        # Initialize AI agents
        if self.openai_api_key:
            llm = OpenAI(temperature=0.3, openai_api_key=self.openai_api_key)
            self.market_agent = MarketMatchingAgent(llm)
            self.pricing_agent = PricingAgent(llm)
            self.risk_agent = RiskScoringAgent(llm)
            self.settlement_agent = None  # Will be set after HCS/HTS creation
            print("AI Agents initialized with OpenAI")
        else:
            print("No OpenAI API key found - using rule-based fallback")
            self.market_agent = None
            self.pricing_agent = None
            self.risk_agent = None
            self.settlement_agent = None
        
        # Store topic and token IDs
        self.hcs_topic_id = None
        self.escrow_token_id = None
        
        # In-memory storage for demo
        self.farmers = {}
        self.buyers = self._initialize_buyers()
        self.trades = {}
        self.transaction_history = {}
        
    def _initialize_buyers(self) -> List[Dict]:
        """Initialize mock buyer database"""
        return [
            {
                "id": "kisumu_coop_001",
                "name": "Kisumu Farmers Co-op",
                "location": "Kisumu",
                "distance_km": 5,
                "reliability_score": 92,
                "capacity_kg": 5000
            },
            {
                "id": "eldoret_coop_001",
                "name": "Eldoret Farmers Co-op",
                "location": "Eldoret",
                "distance_km": 15,
                "reliability_score": 88,
                "capacity_kg": 8000
            },
            {
                "id": "nairobi_market_001",
                "name": "Nairobi Central Market",
                "location": "Nairobi",
                "distance_km": 350,
                "reliability_score": 75,
                "capacity_kg": 20000
            }
        ]
    
    def initialize_hedera_services(self):
        """Create HCS topic and HTS token for the platform"""
        
        # Create HCS topic for transaction logging
        topic_tx = TopicCreateTransaction()
        topic_tx.setTopicMemo("AgroTrack-Lite Transaction Log")
        
        topic_response = topic_tx.execute(self.client)
        topic_receipt = topic_response.getReceipt(self.client)
        self.hcs_topic_id = topic_receipt.topicId
        
        print(f"HCS Topic Created: {self.hcs_topic_id}")
        
        # Create HTS token for escrow (pegged to KES - Kenyan Shillings)
        token_tx = TokenCreateTransaction()
        token_tx.setTokenName("AgroTrack Escrow Token")
        token_tx.setTokenSymbol("ATES")
        token_tx.setDecimals(2)
        token_tx.setInitialSupply(1000000)  # 10,000.00 tokens for demo
        token_tx.setTreasuryAccountId(self.operator_id)
        token_tx.setAdminKey(self.operator_key.getPublicKey())
        token_tx.setSupplyKey(self.operator_key.getPublicKey())
        
        token_response = token_tx.execute(self.client)
        token_receipt = token_response.getReceipt(self.client)
        self.escrow_token_id = token_receipt.tokenId
        
        print(f"HTS Escrow Token Created: {self.escrow_token_id}")
        
        # NOW initialize autonomous settlement agent with HCS and HTS IDs
        if self.openai_api_key:
            llm = OpenAI(temperature=0.2, openai_api_key=self.openai_api_key)
            self.settlement_agent = AutonomousSettlementAgent(
                llm=llm,
                hedera_client=self.client,
                hcs_topic_id=self.hcs_topic_id,
                escrow_token_id=self.escrow_token_id
            )
            print(f"Autonomous Settlement Agent Initialized")
        
        return {
            "hcs_topic_id": str(self.hcs_topic_id),
            "escrow_token_id": str(self.escrow_token_id)
        }
    
    def log_to_hcs(self, event_type: str, data: dict):
        """Log events to Hedera Consensus Service"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "data": data
        }
        
        message = json.dumps(log_entry)
        
        submit_tx = TopicMessageSubmitTransaction()
        submit_tx.setTopicId(self.hcs_topic_id)
        submit_tx.setMessage(message)
        
        response = submit_tx.execute(self.client)
        receipt = response.getReceipt(self.client)
        
        print(f"HCS Log: {event_type} - Status: {receipt.status}")
        return str(response.transactionId)
    
    def process_farmer_sms(self, phone: str, message: str):
        """
        Process incoming SMS from farmer with AI agents
        Format: "Maize 200kg Kisumu"
        """
        try:
            parts = message.split()
            crop = parts[0]
            quantity = parts[1]
            location = parts[2] if len(parts) > 2 else "Unknown"
            
            # Generate trade request
            trade_id = str(uuid.uuid4())[:8]
            
            farmer_request = {
                "trade_id": trade_id,
                "farmer_phone": phone,
                "crop": crop,
                "quantity": quantity,
                "location": location,
                "status": "pending",
                "timestamp": datetime.utcnow().isoformat()
            }
            
            self.trades[trade_id] = farmer_request
            
            # Log to HCS
            hcs_tx_id = self.log_to_hcs("FARMER_REQUEST", farmer_request)
            farmer_request["hcs_tx_id"] = hcs_tx_id
            
            # AI Agent: Market Matching & Pricing
            matched_offer = self.ai_match_and_price(farmer_request)
            
            return {
                "success": True,
                "trade_id": trade_id,
                "offer": matched_offer,
                "hcs_tx_id": hcs_tx_id
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def ai_match_and_price(self, farmer_request: dict):
        """
        Use AI agents to match buyer and calculate pricing
        """
        
        crop = farmer_request["crop"]
        quantity = farmer_request["quantity"]
        location = farmer_request["location"]
        
        # Filter buyers by location proximity
        nearby_buyers = [b for b in self.buyers if b['location'] == location or b['distance_km'] < 50]
        
        # AI Agent 1: Market Matching
        if self.market_agent and nearby_buyers:
            match_result = self.market_agent.match(crop, quantity, location, nearby_buyers)
            buyer = match_result["buyer"]
            match_reason = match_result["reason"]
        else:
            # Fallback: simple proximity match
            buyer = nearby_buyers[0] if nearby_buyers else self.buyers[0]
            match_reason = f"Closest buyer in {buyer['location']}"
        
        # AI Agent 2: Pricing
        if self.pricing_agent:
            pricing_result = self.pricing_agent.calculate_price(crop, quantity, location)
            price_per_kg = pricing_result["price_per_kg"]
            total_price = pricing_result["total_price"]
        else:
            # Fallback: base prices
            base_prices = {"Maize": 45, "Beans": 120, "Tomatoes": 60, "Potatoes": 35}
            price_per_kg = base_prices.get(crop, 50)
            qty_value = float(quantity.replace("kg", ""))
            total_price = price_per_kg * qty_value
        
        offer = {
            "trade_id": farmer_request["trade_id"],
            "crop": crop,
            "quantity": quantity,
            "price_per_kg": price_per_kg,
            "total_price": total_price,
            "currency": "KES",
            "buyer": buyer["name"],
            "buyer_id": buyer["id"],
            "pickup_time": "Tomorrow 10:00 AM",
            "otp": str(uuid.uuid4().int)[:6],
            "match_reason": match_reason
        }
        
        # Log AI matching decision to HCS
        self.log_to_hcs("AI_MATCH", {
            "trade_id": farmer_request["trade_id"],
            "offer": offer,
            "buyer_matched": buyer["name"],
            "algorithm": "ai_agents_v1"
        })
        
        return offer
    
    def buyer_accept_offer(self, trade_id: str, buyer_id: str):
        """Buyer accepts the offer and creates escrow"""
        
        trade = self.trades.get(trade_id)
        if not trade:
            return {"success": False, "error": "Trade not found"}
        
        # AI Agent 3: Risk Scoring
        buyer_history = self.transaction_history.get(buyer_id, [])
        if self.risk_agent:
            risk_result = self.risk_agent.score_risk(buyer_id, buyer_history)
            risk_score = risk_result["risk_score"]
            
            if risk_result["recommendation"] == "require_additional_verification":
                return {
                    "success": False,
                    "error": f"Risk score too high ({risk_score}): {risk_result['reason']}"
                }
        
        # Create HTS escrow
        escrow_amount = int(trade.get("offer", {}).get("total_price", 0) * 100)
        
        escrow_data = {
            "trade_id": trade_id,
            "buyer_id": buyer_id,
            "amount": escrow_amount,
            "token_id": str(self.escrow_token_id),
            "status": "locked"
        }
        
        # Log acceptance to HCS
        hcs_tx_id = self.log_to_hcs("BUYER_ACCEPT", escrow_data)
        
        trade["status"] = "accepted"
        trade["escrow"] = escrow_data
        trade["hcs_accept_tx_id"] = hcs_tx_id
        
        return {
            "success": True,
            "trade_id": trade_id,
            "escrow": escrow_data,
            "hcs_tx_id": hcs_tx_id
        }
    
    def confirm_delivery(self, trade_id: str, otp: str, weight: float, grade: str = "B"):
        """
        Clerk confirms delivery with AUTONOMOUS AGENT taking over
        Agent reads HCS, makes decision, and executes settlement
        """
        
        trade = self.trades.get(trade_id)
        if not trade:
            return {"success": False, "error": "Trade not found"}
        
        # Use autonomous agent if available
        if self.settlement_agent:
            print("\nAutonomous Settlement Agent Processing...")
            
            expected_otp = trade.get("offer", {}).get("otp")
            expected_weight = float(trade["quantity"].replace("kg", ""))
            buyer_id = trade.get("offer", {}).get("buyer_id", "unknown")
            farmer_phone = trade["farmer_phone"]
            
            # Let AI agent make autonomous decision
            decision = self.settlement_agent.autonomous_settlement_decision(
                trade_id=trade_id,
                otp=otp,
                expected_otp=expected_otp,
                actual_weight=weight,
                expected_weight=expected_weight,
                grade=grade,
                buyer_id=buyer_id,
                farmer_phone=farmer_phone
            )
            
            # If agent approves with high confidence, execute autonomously
            if decision['decision'] == 'AUTO_SETTLE' and decision['confidence'] > 0.90:
                print("   Agent approved - executing autonomously")
                
                execution = self.settlement_agent.execute_autonomous_settlement(
                    trade_id=trade_id,
                    farmer_phone=farmer_phone,
                    escrow_amount=trade["escrow"]["amount"],
                    adjustment=decision['adjustment']
                )
                
                # Update trade
                trade["status"] = "completed_autonomous"
                trade["delivery"] = {
                    "actual_weight": weight,
                    "grade": grade,
                    "autonomous": True
                }
                trade["payout"] = {
                    "amount": execution["amount"] / 100,
                    "autonomous": True,
                    "tx_id": execution["tx_id"]
                }
                
                # Log autonomous completion to HCS
                self.log_to_hcs("AUTONOMOUS_SETTLEMENT", {
                    "trade_id": trade_id,
                    "agent_decision": decision,
                    "execution": execution
                })
                
                return {
                    "success": True,
                    "trade_id": trade_id,
                    "autonomous_settlement": True,
                    "decision": decision,
                    "execution": execution,
                    "message": "AI agent autonomously completed settlement"
                }
            else:
                # Agent escalated to human review
                print("   Agent escalating to human review")
                trade["status"] = "pending_human_review"
                trade["requires_review"] = {
                    "reason": decision.get('reason'),
                    "confidence": decision.get('confidence')
                }
                
                return {
                    "success": False,
                    "autonomous_settlement": False,
                    "requires_human_review": True,
                    "reason": decision.get('reason'),
                    "message": "Trade requires human review - agent confidence too low"
                }
        
        # Fallback: Manual processing if no agent
        return self._manual_delivery_confirmation(trade_id, otp, weight, grade)
    
    def _manual_delivery_confirmation(self, trade_id: str, otp: str, weight: float, grade: str):
        """Original manual delivery confirmation (fallback)"""
        trade = self.trades.get(trade_id)
        
        # Verify OTP
        expected_otp = trade.get("offer", {}).get("otp")
        if str(otp) != str(expected_otp):
            return {"success": False, "error": "Invalid OTP"}
        
        # Log delivery confirmation
        delivery_data = {
            "trade_id": trade_id,
            "actual_weight": weight,
            "grade": grade,
            "otp_verified": True,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        hcs_tx_id = self.log_to_hcs("DELIVERY_CONFIRMED", delivery_data)
        
        # Simulate escrow release
        payout_data = {
            "trade_id": trade_id,
            "farmer_phone": trade["farmer_phone"],
            "amount": trade["escrow"]["amount"] / 100,
            "payment_method": "M-Pesa",
            "status": "completed"
        }
        
        # Log payout to HCS
        payout_hcs_id = self.log_to_hcs("PAYOUT_COMPLETED", payout_data)
        
        trade["status"] = "completed"
        trade["delivery"] = delivery_data
        trade["payout"] = payout_data
        
        return {
            "success": True,
            "trade_id": trade_id,
            "payout": payout_data,
            "hcs_delivery_tx_id": hcs_tx_id,
            "hcs_payout_tx_id": payout_hcs_id
        }
    
    def get_trade_proof(self, trade_id: str):
        """Generate immutable proof of trade from HCS logs"""
        trade = self.trades.get(trade_id)
        if not trade:
            return None
        
        return {
            "trade_id": trade_id,
            "farmer": trade["farmer_phone"],
            "crop": trade["crop"],
            "quantity": trade["quantity"],
            "status": trade["status"],
            "hcs_logs": {
                "request": trade.get("hcs_tx_id"),
                "accept": trade.get("hcs_accept_tx_id"),
                "delivery": trade.get("delivery", {}).get("hcs_tx_id"),
                "payout": trade.get("payout", {}).get("hcs_tx_id")
            },
            "escrow_token": str(self.escrow_token_id),
            "topic_id": str(self.hcs_topic_id),
            "ai_agents_used": ["market_matching", "pricing", "risk_scoring"]
        }


# Example usage for demo
def demo_flow():
    """Complete demo flow for hackathon - loads credentials from .env"""
    
    # Initialize - credentials loaded from .env automatically
    print("\n Loading credentials from .env file...")
    agrotrack = AgroTrackBackend()
    
    print(f"Loaded Hedera Account: {agrotrack.operator_id}")
    print(f"OpenAI API Key: {'Configured' if agrotrack.openai_api_key else 'Not found'}")
    
    # Setup Hedera services
    print("\n Initializing Hedera Services...")
    agrotrack.initialize_hedera_services()
    
    # Step 1: Farmer sends SMS (AI agents process)
    print("\n Step 1: Farmer SMS Request (AI Processing)...")
    farmer_response = agrotrack.process_farmer_sms(
        phone="+254712345678",
        message="Maize 200kg Kisumu"
    )
    print(f"AI Agents matched buyer and calculated price:")
    print(f"   Buyer: {farmer_response['offer']['buyer']}")
    print(f"   Price: KES {farmer_response['offer']['total_price']}")
    print(f"   Reason: {farmer_response['offer']['match_reason']}")
    
    trade_id = farmer_response["trade_id"]
    
    # Step 2: Buyer accepts offer (with risk check)
    print("\n Step 2: Buyer Accepts (Risk Agent Check)...")
    buyer_response = agrotrack.buyer_accept_offer(
        trade_id=trade_id,
        buyer_id="kisumu_coop_001"
    )
    if buyer_response.get("success"):
        print(f"Escrow Created: {buyer_response['escrow']['amount']} ATES tokens")
    else:
        print(f"Acceptance failed: {buyer_response.get('error')}")
        return
    
    # Step 3: Delivery confirmation (AUTONOMOUS AGENT IN ACTION)
    print("\n Step 3: Delivery Confirmed (Autonomous Agent)...")
    delivery_response = agrotrack.confirm_delivery(
        trade_id=trade_id,
        otp=farmer_response["offer"]["otp"],
        weight=196.8,
        grade="B"
    )
    
    if delivery_response.get("autonomous_settlement"):
        print(f"AUTONOMOUS: Agent completed settlement without human intervention")
        print(f"   Decision confidence: {delivery_response['decision']['confidence']:.0%}")
        print(f"   Payout amount: KES {delivery_response['execution']['amount'] / 100}")
    else:
        print(f"Payout Completed (Manual): {delivery_response.get('payout', {}).get('amount', 0)} via M-Pesa")
    
    # Step 4: Get immutable proof
    print("\n Step 4: Immutable Trade Proof...")
    proof = agrotrack.get_trade_proof(trade_id)
    print(f"AI Agents Used: {', '.join(proof['ai_agents_used'])}")
    print(f"HCS Logs: {len([v for v in proof['hcs_logs'].values() if v])} events")
    
    # Summary - Human readable output
    # Convert Java objects to strings properly
    account_id_str = agrotrack.operator_id.toString()
    topic_id_str = agrotrack.hcs_topic_id.toString()
    token_id_str = agrotrack.escrow_token_id.toString()
    
    print("\n" + "="*70)
    print("AGROTRACK-LITE DEMO COMPLETED SUCCESSFULLY")
    print("="*70)
    print("\nHedera Testnet Resources Created:")
    print(f"  Account ID:    {account_id_str}")
    print(f"  HCS Topic ID:  {topic_id_str}")
    print(f"  HTS Token ID:  {token_id_str}")
    print(f"  Token Symbol:  ATES (AgroTrack Escrow Token)")
    print(f"  Network:       Testnet")
    
    print("\nVerify on HashScan:")
    print(f"  Topic:  https://hashscan.io/testnet/topic/{topic_id_str}")
    print(f"  Token:  https://hashscan.io/testnet/token/{token_id_str}")
    print(f"  Account: https://hashscan.io/testnet/account/{account_id_str}")
    
    print("\nTrade Summary:")
    print(f"  Trade ID:      {trade_id}")
    print(f"  Farmer:        {farmer_response['offer']['crop']} farmer in Kisumu")
    print(f"  Quantity:      {farmer_response['offer']['quantity']}")
    print(f"  Price:         KES {farmer_response['offer']['total_price']}")
    print(f"  Buyer:         {farmer_response['offer']['buyer']}")
    print(f"  Status:        {'Autonomous Settlement' if delivery_response.get('autonomous_settlement') else 'Manual Settlement'}")
    
    print("\nAI Agents Performance:")
    print(f"  Market Matching: Active")
    print(f"  Pricing Agent:   Active")
    print(f"  Risk Scoring:    Active")
    print(f"  Settlement:      {'Autonomous' if delivery_response.get('autonomous_settlement') else 'Manual'}")
    
    if delivery_response.get('autonomous_settlement'):
        print(f"\nAutonomous Decision:")
        print(f"  Confidence:    {delivery_response['decision']['confidence']:.1%}")
        print(f"  Adjustment:    {delivery_response['decision']['adjustment']:.1%}")
        print(f"  Reason:        {delivery_response['decision']['reason']}")
    
    print("\n" + "="*70)
    print("SAVE THESE IDs FOR YOUR HACKATHON SUBMISSION:")
    print("="*70)
    print(f"\nHEDERA_ACCOUNT_ID={account_id_str}")
    print(f"HCS_TOPIC_ID={topic_id_str}")
    print(f"HTS_TOKEN_ID={token_id_str}")
    print("\n" + "="*70 + "\n")


if __name__ == "__main__":
    demo_flow()
