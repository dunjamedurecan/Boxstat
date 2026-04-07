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
});