const models = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
];

async function testModel(model) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    console.log(`Model ${model}: Status ${res.status}`);
    if (!res.ok) {
      console.log(`  Error: ${data.error?.message || JSON.stringify(data)}`);
    } else {
      console.log(`  Success: ${data.choices?.[0]?.message?.content}`);
    }
  } catch (err) {
    console.error(`Model ${model} failed:`, err.message);
  }
}

async function run() {
  console.log("GROQ_API_KEY exists:", !!process.env.GROQ_API_KEY);
  for (const model of models) {
    await testModel(model);
  }
}

run();
