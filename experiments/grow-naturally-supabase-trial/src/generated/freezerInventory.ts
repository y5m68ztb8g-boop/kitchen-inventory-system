export type FreezerInventoryItem = {
  id: string;
  productName: string;
  locationCode: string;
  quantityText: string;
  recordedSupplierCode: string;
  suggestedSupplierCode: string;
  suggestedSupplierProductCode: string;
};

export const FREEZER_INVENTORY: FreezerInventoryItem[] = [
  {
    "id": "CK001",
    "productName": "Chicken Breast",
    "locationCode": "A1",
    "quantityText": "7 Cases",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "CK002",
    "productName": "Balmoral Chicken",
    "locationCode": "A1",
    "quantityText": "1 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "PK001",
    "productName": "Raw Gammon Joint",
    "locationCode": "A1",
    "quantityText": "2 Packs",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "PK002",
    "productName": "Roasted Gammon (Sliced)",
    "locationCode": "A1",
    "quantityText": "2 Trays",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "CK003",
    "productName": "Chicken Curry",
    "locationCode": "A1",
    "quantityText": "1 Tub",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "TK001",
    "productName": "Gluten Free Turkey Roulade",
    "locationCode": "A1",
    "quantityText": "1 Roll",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "134553"
  },
  {
    "id": "BF001",
    "productName": "Lasagne",
    "locationCode": "A2",
    "quantityText": "1 Tub",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BF002",
    "productName": "Cottage Pie Mix",
    "locationCode": "A2",
    "quantityText": "1 Tub",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "PK003",
    "productName": "Pork Sausage Meat",
    "locationCode": "A2",
    "quantityText": "2 Chubs",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BF003",
    "productName": "Chilli Con Carne",
    "locationCode": "A2",
    "quantityText": "1 Tray",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "PK004",
    "productName": "Lorne Sausage",
    "locationCode": "A2",
    "quantityText": "1 Tray",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "CMP",
    "suggestedSupplierProductCode": "20LORSLI"
  },
  {
    "id": "PK005",
    "productName": "Link Sausage",
    "locationCode": "A2",
    "quantityText": "3 Trays",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "FS001",
    "productName": "Sea Bass",
    "locationCode": "A3",
    "quantityText": "4 Pieces",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "CMP",
    "suggestedSupplierProductCode": "26SEAPOR"
  },
  {
    "id": "FS002",
    "productName": "Haddock (Loose)",
    "locationCode": "A3",
    "quantityText": "3 Pieces",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "CMP",
    "suggestedSupplierProductCode": "26HADFAN"
  },
  {
    "id": "FS003",
    "productName": "Salmon Cutlet",
    "locationCode": "A3",
    "quantityText": "1 Box",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "FS004",
    "productName": "Fish Cakes",
    "locationCode": "A3",
    "quantityText": "2 Cases",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "FS005",
    "productName": "Haddock Skinless 8-10oz",
    "locationCode": "A3",
    "quantityText": "2 Cases",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "CMP",
    "suggestedSupplierProductCode": "28HADFZIQF"
  },
  {
    "id": "FS006",
    "productName": "MSC Breaded Plaice",
    "locationCode": "A3",
    "quantityText": "1 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "FS007",
    "productName": "Omega Scottish Hot Smoked Mackerel Fillets",
    "locationCode": "A3",
    "quantityText": "1 Case + 2 Packs",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "CMP",
    "suggestedSupplierProductCode": "26MACKSM"
  },
  {
    "id": "FR001",
    "productName": "Ice",
    "locationCode": "P1",
    "quantityText": "5 Cases + 2 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "136145"
  },
  {
    "id": "PT001",
    "productName": "Mashed Potato",
    "locationCode": "P4",
    "quantityText": "1 Open Case (2 Bags), placed on top of pallet stack",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "149710"
  },
  {
    "id": "PT002",
    "productName": "Chunky Chips",
    "locationCode": "P2",
    "quantityText": "1 Case + 2 Bags",
    "recordedSupplierCode": "F13557",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "135177"
  },
  {
    "id": "PT003",
    "productName": "French Fries",
    "locationCode": "P3",
    "quantityText": "4 Cases",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK001",
    "productName": "Morning Rolls 8x6",
    "locationCode": "B0",
    "quantityText": "Quantity not confirmed",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK002",
    "productName": "White Batch Rolls",
    "locationCode": "B0",
    "quantityText": "1 Case + 0.5 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "30319"
  },
  {
    "id": "BK003",
    "productName": "Fully Baked Artisan Plain Sourdough Loaves",
    "locationCode": "B0",
    "quantityText": "2 Loaves",
    "recordedSupplierCode": "113099",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "113099"
  },
  {
    "id": "BK004",
    "productName": "5 inch Sesame Seed Burger Bun",
    "locationCode": "B1",
    "quantityText": "~15 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "3625"
  },
  {
    "id": "BK005",
    "productName": "Part Baked Butter Pastry Bread",
    "locationCode": "B1",
    "quantityText": "7 Pieces; exact product name to confirm",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK006",
    "productName": "Garlic Pastry Bread Slices",
    "locationCode": "B1",
    "quantityText": "~30 Slices",
    "recordedSupplierCode": "5011050",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "5011050"
  },
  {
    "id": "BK007",
    "productName": "Fully Baked Mini Petit Pain",
    "locationCode": "B2",
    "quantityText": "Approx 1 Case, original box removed",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK008",
    "productName": "Pita Bread",
    "locationCode": "B2",
    "quantityText": "1 large bag, ~50 Pieces",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK009",
    "productName": "Wholemeal Sliced Bread",
    "locationCode": "B3",
    "quantityText": "4 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK010",
    "productName": "White Sliced Bread",
    "locationCode": "B3",
    "quantityText": "~34 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK011",
    "productName": "Pizza Bases / Kids Pizza",
    "locationCode": "B4",
    "quantityText": "5 Packs",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK012",
    "productName": "Square Flatbread",
    "locationCode": "B4",
    "quantityText": "5 Packs; exact name to confirm",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK013",
    "productName": "10 inch Fully Baked Flour Tortillas",
    "locationCode": "B4",
    "quantityText": "1 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK014",
    "productName": "Garlic Coriander Naan Bread Large",
    "locationCode": "B4",
    "quantityText": "1.5 Packs",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "BK015",
    "productName": "Garlic Coriander Naan Bread Small",
    "locationCode": "B4",
    "quantityText": "15 Pieces",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C001",
    "productName": "Salted Butter Portions",
    "locationCode": "C0",
    "quantityText": "1.5 Cases; individually portioned salted butter",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C002",
    "productName": "Gluten Free Sultana Scones",
    "locationCode": "C1",
    "quantityText": "~20 Pieces in opened box",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C003",
    "productName": "Gluten Free British Sausages",
    "locationCode": "C1",
    "quantityText": "1 opened Case; only a small amount used",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C004",
    "productName": "Gluten Free White Rolls",
    "locationCode": "C1",
    "quantityText": "~30 Rolls",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "135096"
  },
  {
    "id": "C005",
    "productName": "Gluten Free White Sliced Bread",
    "locationCode": "C1",
    "quantityText": "6 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C006",
    "productName": "Gluten Free Wholemeal Sliced Bread",
    "locationCode": "C1",
    "quantityText": "2 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C007",
    "productName": "Mixed Vegetable Pakora",
    "locationCode": "C2",
    "quantityText": "1 Bag",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C008",
    "productName": "Chicken Pakora Bites",
    "locationCode": "C2",
    "quantityText": "1 Bag",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C009",
    "productName": "Potato Gratin",
    "locationCode": "C2",
    "quantityText": "5 Bag-equivalents; includes 4 sealed bags plus 1 opened box of ~15 pieces",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C010",
    "productName": "Garden Peas",
    "locationCode": "C2",
    "quantityText": "1 Bag",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "4753"
  },
  {
    "id": "C011",
    "productName": "Swede",
    "locationCode": "C2",
    "quantityText": "1 Bag",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C012",
    "productName": "Brussels Sprouts",
    "locationCode": "C2",
    "quantityText": "1.5 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C013",
    "productName": "Extra Fine Whole Green Beans",
    "locationCode": "C2",
    "quantityText": "1.5 Bags",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C014",
    "productName": "Vegetable Kyiv",
    "locationCode": "C3",
    "quantityText": "0.75 Case remaining",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "146283"
  },
  {
    "id": "C015",
    "productName": "Vegetable Lasagne Verdi",
    "locationCode": "C3",
    "quantityText": "1 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C016",
    "productName": "Vegetarian Burger",
    "locationCode": "C3",
    "quantityText": "2 Bags",
    "recordedSupplierCode": "148602",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "148602"
  },
  {
    "id": "C017",
    "productName": "Vegan Sausage 4\"",
    "locationCode": "C3",
    "quantityText": "1 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C018",
    "productName": "Unbaked Vegan Sausage 6\"",
    "locationCode": "C3",
    "quantityText": "1 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C019",
    "productName": "Vegan Sausage",
    "locationCode": "C3",
    "quantityText": "0.5 Bag",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C020",
    "productName": "Mini Vegetable Spring Rolls",
    "locationCode": "C3",
    "quantityText": "3 Cases",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C021",
    "productName": "Vegetable Pakoras",
    "locationCode": "C3",
    "quantityText": "1 Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C022",
    "productName": "Roast Potato Portions (Unconfirmed Product)",
    "locationCode": "C3",
    "quantityText": "2 small blue bags; exact product name to confirm",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "C023",
    "productName": "Vegetable Wellington",
    "locationCode": "C4",
    "quantityText": "1 full Case + 6 loose Portions from opened Case",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D001",
    "productName": "Shortcrust Pastry Block",
    "locationCode": "D0",
    "quantityText": "1 Block; supermarket purchase, not a normal supplier item",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D002",
    "productName": "Oven Proof Pastry Lids",
    "locationCode": "D0",
    "quantityText": "1 full Case",
    "recordedSupplierCode": "F4307",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D003",
    "productName": "Puff Pastry Sheets",
    "locationCode": "D0",
    "quantityText": "0.5 Case remaining",
    "recordedSupplierCode": "F4303",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D004",
    "productName": "Berry Go Round",
    "locationCode": "D1",
    "quantityText": "~50 small Packs; source not confirmed",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D005",
    "productName": "Cream Puffs / Profiteroles",
    "locationCode": "D1",
    "quantityText": "4 Cases",
    "recordedSupplierCode": "F38230",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D006",
    "productName": "Marquez Ice Cream 5L",
    "locationCode": "D2",
    "quantityText": "1 opened Tub; only a small amount used",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D007",
    "productName": "Vanilla Ice Cream",
    "locationCode": "D2",
    "quantityText": "1 Tub",
    "recordedSupplierCode": "F261",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D008",
    "productName": "Chocolate Ice Cream",
    "locationCode": "D2",
    "quantityText": "1 Tub",
    "recordedSupplierCode": "F32202",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D009",
    "productName": "Sorbet - Flavour to Confirm",
    "locationCode": "D2",
    "quantityText": "3 Tubs",
    "recordedSupplierCode": "F33600",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D010",
    "productName": "Orange Sorbet",
    "locationCode": "D2",
    "quantityText": "2 Tubs",
    "recordedSupplierCode": "F33605",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D011",
    "productName": "Chocolate Mousse",
    "locationCode": "D2",
    "quantityText": "1 Tub",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D012",
    "productName": "Lemon Sorbet",
    "locationCode": "D2",
    "quantityText": "3 Tubs",
    "recordedSupplierCode": "F33609",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "136786"
  },
  {
    "id": "D013",
    "productName": "Champagne Sorbet",
    "locationCode": "D2",
    "quantityText": "2 Tubs",
    "recordedSupplierCode": "F33-569",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D014",
    "productName": "Homemade Tiramisu",
    "locationCode": "D2",
    "quantityText": "2 Trays; 26 Portions total",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D015",
    "productName": "Homemade Lemon & Lime Dessert",
    "locationCode": "D3",
    "quantityText": "1 Box; product name heard as 'Lemon and Lime Silence', confirm exact name",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "123502"
  },
  {
    "id": "D016",
    "productName": "Homemade Rocky Road",
    "locationCode": "D3",
    "quantityText": "1 Box",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D017",
    "productName": "Homemade White Chocolate Pastry Bake",
    "locationCode": "D3",
    "quantityText": "1 Box; exact product name to confirm",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D018",
    "productName": "Vanilla Sponge",
    "locationCode": "D3",
    "quantityText": "1 large piece",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D019",
    "productName": "Chocolate Fondant Cake",
    "locationCode": "D3",
    "quantityText": "4 small Packs",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D020",
    "productName": "Chocolate Brownie",
    "locationCode": "D3",
    "quantityText": "1 Cake (900g)",
    "recordedSupplierCode": "136269",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "136269"
  },
  {
    "id": "D021",
    "productName": "Lemon Streusel Tray Cake",
    "locationCode": "D3",
    "quantityText": "1 Case",
    "recordedSupplierCode": "117350",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "117350"
  },
  {
    "id": "D022",
    "productName": "Chocolate Fudge Cake",
    "locationCode": "D3",
    "quantityText": "2 Boxes",
    "recordedSupplierCode": "F41554",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D023",
    "productName": "Bakers Chocolate Orange Dessert",
    "locationCode": "D3",
    "quantityText": "~10 Slices",
    "recordedSupplierCode": "F123224",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "123224"
  },
  {
    "id": "D024",
    "productName": "Chocolate Stodgy Pudding Squares",
    "locationCode": "D3",
    "quantityText": "5 unopened Cases",
    "recordedSupplierCode": "F136476",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D025",
    "productName": "Homemade Cheese & Onion Rolls",
    "locationCode": "D4",
    "quantityText": "2 Boxes",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D026",
    "productName": "Assorted Pastries",
    "locationCode": "D4",
    "quantityText": "1 Box; flat pastries with assorted cheese/berry-style toppings",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "",
    "suggestedSupplierProductCode": ""
  },
  {
    "id": "D027",
    "productName": "Ready-to-Bake Mini Croissants",
    "locationCode": "D4",
    "quantityText": "1 Case / pack present",
    "recordedSupplierCode": "F33516",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "33516"
  },
  {
    "id": "D028",
    "productName": "Potato Scones",
    "locationCode": "D4",
    "quantityText": "~24 Packs",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "BRK",
    "suggestedSupplierProductCode": "460806"
  },
  {
    "id": "FS008",
    "productName": "Smoked Haddock (Loose)",
    "locationCode": "A3",
    "quantityText": "3 Pieces",
    "recordedSupplierCode": "",
    "suggestedSupplierCode": "CMP",
    "suggestedSupplierProductCode": "26HADSMO"
  }
];
