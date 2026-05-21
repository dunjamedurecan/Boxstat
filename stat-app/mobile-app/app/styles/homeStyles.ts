import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 900,
    padding: 24,
    paddingBottom: 50,
    backgroundColor: "#ffffff",
    gap: 16,
  },

  userText: {
    fontSize: 18,
    color: "#1f2933",
  },
  userBold: {
    color: "#c1121f",
    fontWeight: "800",
  },

  buttonGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 6,
  },

  btn: {
    backgroundColor: "#c1121f",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    shadowColor: "#c1121f",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  btnStop: {
    backgroundColor: "#9b111e",
  },
  btnPressed: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.35,
  },
  btnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },

  statusCard: {
    marginTop: 10,
    padding: 18,
    borderRadius: 14,
    backgroundColor: "#fff5f5",
    borderLeftWidth: 6,
    borderLeftColor: "#c1121f",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  statusCardActive: {
    backgroundColor: "#ffecec",
  },
  statusText: {
    color: "#1f2933",
    fontWeight: "600",
  },

  qrWrap: {
    marginTop: 10,
  },
  headerRow:{
flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#c1121f",
    lineHeight: 34,
  },
  row:{
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    marginTop: 6,
  },
  sectionTitle:{
     marginTop: 18,
    marginBottom: 8,
    fontSize: 18,
    fontWeight: "800",
    color: "#c1121f",
  },
  subTitle:{
    marginTop: 12,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "800",
    color: "#9b111e",
  },
  practiceItem: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    borderLeftWidth: 6,
    borderLeftColor: "#e63946",
  },
   practiceItemSelected: { borderLeftColor: "#c1121f", backgroundColor: "#fff5f5" },
  practiceText: { color: "#1f2933", fontSize: 13, fontWeight: "600" },
  chartCard:{
     marginTop: 18,
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    borderTopWidth: 5,
    borderTopColor: "#c1121f",
    gap: 12,
  },
  chartWrap: {
    width: "100%",
    height: 320,
    position: "relative",
    borderRadius: 10,
    overflow: "hidden",
  },
  selectionOverlay: {
     position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(193, 18, 31, 0.18)",
    borderColor: "rgba(193, 18, 31, 0.55)",
    borderWidth: 1,
    zIndex: 10,
  },
  card: {
    marginTop: 18,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    borderLeftWidth: 6,
    borderLeftColor: "#e63946",
    gap: 6,
  },

  text: { marginVertical: 2, fontSize: 14, color: "#1f2933" },
  bold: { color: "#c1121f", fontWeight: "800" },
  empty: { marginTop: 14, fontStyle: "italic", color: "#6b7280" },

  listBlock: { marginTop: 8, gap: 10 },
  listRow: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  practiceList: { marginTop: 8, maxHeight: 170 },
  compareSelectorRow:{
    flexDirection:"row",
    alignItems:"center",
    gap:8,
    marginTop: 12,
    marginBottom: 8,
  },
  compareSelectorItem:{
    paddingHorizontal: 12,
  paddingVertical: 7,
  borderRadius: 10,
  backgroundColor: "#f1f5fa",
  marginRight: 7,
  borderWidth: 2,
  borderColor: "#d1d5db",
  },
  compareSelectorItemActive: {
  backgroundColor: "#e0f2fe",
  borderColor: "#1976d2",
},
compareSelectorText: {
  fontWeight: "700",
  color: "#444",
},
compareSelectorTextActive: {
  color: "#1976d2",
},
removeCompareBtn: {
  marginTop: 4,
  alignSelf: "flex-start",
  backgroundColor: "#e0e7ef",
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 8,
},
removeCompareBtnText: {
  color: "#1976d2",
  fontWeight: "700",
  fontSize: 13,
},
// Za osnovnu statistiku (npr. duration, maxForce...)
basicStatsCard: {
  backgroundColor: "#fdf6f6",
  borderRadius: 10,
  marginVertical: 8,
  padding: 12,
  borderLeftWidth: 4,
  borderLeftColor: "#c1121f",
  marginBottom: 8,
  gap: 3,
},
basicStatsTitle: {
  fontWeight: "bold",
  color: "#c1121f",
  fontSize: 16,
  marginBottom: 4,
},
basicStatsLabel: {
  color: "#242424",
  fontSize: 14,
  marginBottom: 2,
},
// Za naprednu statistiku
advancedStatsCard: {
  backgroundColor: "#f4f7fa",
  borderRadius: 10,
  marginVertical: 8,
  padding: 12,
  borderLeftWidth: 4,
  borderLeftColor: "#1976d2",
  marginBottom: 8,
  gap: 3,
},
advancedStatsTitle: {
  fontWeight: "bold",
  color: "#1976d2",
  fontSize: 16,
  marginBottom: 4,
},
advancedStatsLabel: {
  color: "#333",
  fontSize: 14,
  marginBottom: 2,
},
powerTimelineCard: {
  backgroundColor: '#f7fdfc',
  borderRadius: 10,
  marginVertical: 8,
  padding: 12,
  borderLeftWidth: 4,
  borderLeftColor: '#41b883',     // nježno-zelena, možeš promijeniti
  // ili #5046e6 ako želiš "plavo" (ili presloži po svojoj paleti)
  gap: 3,
},

powerTimelineTitle: {
  fontWeight: "bold",
  color: "#238663",               // tamnija zelena, ili "#3b82f6" za blue
  fontSize: 16,
  marginBottom: 4,
},

powerTimelineLabel: {
  color: "#263238",
  fontSize: 14,
  marginBottom: 2,
},

powerTimelineHighlight: {
  color: "#41b883",
  fontWeight: "bold",
},
barChartSection: {
  backgroundColor: "#f5f8fc",
  borderRadius: 10,
  marginTop: 14,
  padding: 14,
  borderLeftWidth: 4,
  borderLeftColor: "#3b82f6",    // ili #41b883 za zelenu, ili tvoju crvenu #c1121f
  alignItems: "center",
},
barChartTitle: {
  fontWeight: "bold",
  color: "#3b82f6",              // ili #c1121f/#41b883 po temi
  fontSize: 16,
  marginBottom: 7,
},
barChart: {
  borderRadius: 10,
  marginVertical: 12,
}
});