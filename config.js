window.WVIS_CONFIG = {
    companyName: "realme WVIS",
  dashboardTitle: "Sales Performance Dashboard",

  // Your central realme WVIS Google Sheet database.
  googleSheetUrl: "https://docs.google.com/spreadsheets/d/1M770AM2aK4r2ZxxZtUOGKCSmXwrFbF56H_Qw9EDNT4s/edit?gid=2037206838#gid=2037206838",

  // Main sales source. The two-file upload system takes priority whenever files are uploaded.
  sheets: {
    sales: "SMARTPHONE COMBINED (AUTO)"
  },

  refreshMs: 60000,
  demoModeFallback: true
};

