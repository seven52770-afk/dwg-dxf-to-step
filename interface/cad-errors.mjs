export function cadFailure(error,phase='建模'){
 const detail=[error.stderr,error.stdout,error.message].filter(Boolean).join('\n');
 const rules=[
  [/NodeUnavailable|node was not found/i,'本機建模環境找不到 Node.js，請重新啟動工作室。'],
  [/ENOENT|No such file|No module named|offline/i,'本機 CAD 程式或套件不完整；需要修復本地安裝環境。'],
  [/Hole center does not intersect/i,'孔中心沒有穿過實體；請核對所選視圖、左右反轉與孔的進刀面。'],
  [/Blind hole has no remaining floor/i,'圖註孔深超過目前局部壁厚；先核對進刀面與外形。若確認要照圖註切穿，可只對該孔勾選「允許穿出內腔」，系統會在 STEP 留下說明。'],
  [/Counterbore step cannot be verified/i,'目前外形無法保留圖註沉孔的階底；請核對進刀面及沉孔深度。'],
  [/Hole did not remove material/i,'所選孔槽沒有切到材料，可能與既有孔重複或視圖方向不符。'],
  [/Views have no common solid/i,'各視圖沒有共同實體；請核對主視圖、側視圖及投影方向。'],
  [/projection or geometry checks failed/i,'STEP 未通過投影、孔深、螺紋牙型或單一實體檢查；此結果不會當作成功模型交付。'],
  [/invalid polygon|self.intersect|wire.*closed|BRep_API|Standard_Failure/i,'輪廓可能自交、未封閉或形成零厚度接觸；請核對所選完整外輪廓。'],
 ];
 const found=rules.find(([re])=>re.test(detail));
 return {detail,error:found?found[1]:error.killed?`${phase}超過本機處理時間，工作已停止；可減少一次建模的特徵後重試。`:`${phase}未完成，已保留詳細診斷。請核對視圖及特徵後重試。`};
}
