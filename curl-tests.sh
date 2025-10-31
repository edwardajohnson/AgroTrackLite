#!/bin/bash
BASE_URL="http://localhost:3000"

echo "🚀 Testing AgroTrack-Lite API"

# 1️⃣ Health check
curl -s $BASE_URL/health; echo

# 2️⃣ Simulate a farmer delivery
curl -s -X POST $BASE_URL/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=+254700000001" \
  -d "text=Delivered 200kg OTP 553904 Grade A"; echo

# 3️⃣ Check pending queue
curl -s $BASE_URL/api/pending; echo

# 4️⃣ Buyer confirms delivery (creates planner task)
curl -s -X POST $BASE_URL/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=+254711000002" \
  -d "text=Confirm 553904"; echo

# 5️⃣ View the planner queue
curl -s $BASE_URL/api/queue; echo

# 6️⃣ If REQUIRE_OPERATOR_APPROVAL=true, approve manually:
# (Replace TASK_ID with actual task ID returned in previous step)
# curl -s -X POST "$BASE_URL/api/approve?id=TASK_ID"; echo

# 7️⃣ View HCS messages
curl -s $BASE_URL/api/messages; echo

echo "✅ Tests completed."

