# DWG / DXF to STEP — 本地創作工作室

由 CNC 銑床實務需求出發的早期開源工具，提供繁體中文介面、本地 AI 對話、圖面分析、輪廓拉伸、多視圖外形重建及 STEP/STL 匯出。

## 限制

這不是任意工程圖自動完整還原工具。視圖、單位、尺寸、孔槽及加工特徵需人工核對；幾何有效不代表圖註、公差或加工要求全部符合。請勿直接將輸出視為加工交付件。

公開版本不包含私人工程圖、模型、歷史測試紀錄、備份或特定零件重建方案。原始本機版本的歷史驗證不代表此公開版完成全部端到端驗證。

## 環境與啟動（Windows）

需要 Node.js（支援 fetch）、Ollama、Python 3.13，以及 Python 套件 cadgen==0.7.20、ezdxf、shapely、pdfplumber、pypdfium2。第三方套件與模型各有其授權，不包含在本專案授權內。

1. 在專案目錄建立 Python 虛擬環境：`py -3.13 -m venv .venv`。
2. 安裝 CAD 與圖面套件：`.\.venv\Scripts\python.exe -m pip install cadgen==0.7.20 ezdxf shapely pdfplumber pypdfium2`。
3. 執行 `setup-profiles.ps1`，下載 Ollama 模型並建立三個角色；首次下載需要網路與足夠磁碟空間。
4. PDF 功能另設定 `JIMMY_STUDIO_PYTHON` 指向已安裝上述套件的 Python；視覺規劃需另備 qwen3-vl:4b-instruct-q4_K_M。
5. DWG 需要自行安裝官方 ODA File Converter（預設搜尋 C:/Program Files/ODA）；未安裝可先使用 DXF。
6. 執行 `開啟本地AI.cmd`，瀏覽 http://127.0.0.1:17863/ 。

CAD 執行器預設使用專案 .venv/Scripts；也可用 JIMMY_STUDIO_CAD_SCRIPTS 指定。FreeCAD 為選用功能，可在不提交的 freecad.json 設定 python 執行檔路徑。完整安裝流程尚需在乾淨 Windows 環境驗證。

## 資料與安全

服務只監聽 127.0.0.1，請勿直接暴露至網際網路。專案與模型預設保存在使用者 LocalAppData/JimmyLocalAI；可用 JIMMY_STUDIO_DATA 改為其他目錄。聊天另存於瀏覽器本機儲存空間。

請勿提交客戶圖面、私人模型、金鑰、日誌或對話紀錄。回報問題請使用自行產生的合成圖面與不含私人資料的最小重現案例。

## 授權

MIT，詳見 LICENSE。維護者：JIMMY CHIU（seven52770-afk）。
