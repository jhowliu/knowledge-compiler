# RAG 評估流程補充

RAG evaluation 不應該只看最後答案好不好，也要先看 retrieval 是否找到了正確的 approved knowledge blocks。

如果檢索階段沒有找到足夠的知識區塊，答案生成通常會失敗；這時候不應該先改 answer prompt，
而是要檢查 chunking、concept index、以及 knowledge links。

補充流程：

1. 先準備代表性問題。
2. 對每個問題記錄 retrieved knowledge blocks。
3. 檢查這些 blocks 是否足以回答問題。
4. 只有 retrieval 足夠時，才評估答案的 coverage、citation、refusal behavior。

Raw source chunks 比較適合作為 evidence trail，不應該直接當成主要回答語料。
主要回答語料應該是經過審核的 approved knowledge blocks。

