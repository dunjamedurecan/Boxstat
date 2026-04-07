import { StyleSheet } from "react-native";

export const styles=StyleSheet.create({
    bg: {flex: 1},
    safe:{
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 20,
    },
    card: {
        width: "100%",
        maxWidth: 420,
        alignSelf: "center",
        backgroundColor: "#ffffff",
        paddingHorizontal: 20,
        paddingBottom: 24,
        paddingTop: 28,
        borderRadius: 16,
        borderTopWidth: 6,
        borderTopColor: "#c1121f",
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5,
    },
    title:{
        marginBottom: 20,
        textAlign: "center",
        color: "#c1121f",
        fontSize: 28,
        fontWeight: "700",
        lineHeight: 34,
    },

    form: {
        gap:16,
    },

    label:{
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 6,
    },

    input: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        fontSize: 15,
        backgroundColor: "#fff",
    },

    inputFocused: {
        borderColor: "#c1121f",
    },

     errorBox: {
    backgroundColor: "#ffecec",
    borderLeftWidth: 4,
    borderLeftColor: "#c1121f",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  errorText: {
    color: "#9b111e",
    fontSize: 14,
  },

  btn: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#c1121f",
    shadowColor: "#c1121f",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btnPressed: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.4,
  },
  btnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 16,
  },

  linkRow: {
    marginTop: 12,
    alignItems: "center",
  },
  linkText: {
    fontSize: 14,
    color: "#374151",
  },
  link: {
    color: "#c1121f",
    fontWeight: "700",
  },

})