import Testing
@testable import EnStorStarkModel

@Suite struct StampFormattingTests {
    @Test(arguments: [(-1, 0), (0, 0), (1, 1), (2, 2), (3, 3), (7, 3)])
    func stampCountIsTheOverallRatingClampedToThree(rating: Int, stamps: Int) {
        #expect(Formatting.stampCount(rating) == stamps)
    }

    @Test(arguments: [
        (0, "Ingen stämpel"),
        (1, "En stämpel"),
        (2, "Två stämplar"),
        (3, "Tre stämplar"),
    ])
    func stampsAreCountedInWords(rating: Int, text: String) {
        #expect(Formatting.stamps(rating) == text)
    }

    @Test func theAwardNamesTheWordAndTheStampsButNeverAScoreOutOfThree() {
        #expect(Formatting.stampAward(2) == "Riktigt bra · två stämplar")
        #expect(Formatting.stampAward(1) == "Sticker ut · en stämpel")
        #expect(Formatting.stampAward(0) == "Inget extra · ingen stämpel")
        #expect(!Formatting.stampAward(3).contains("av 3"))
    }

    @Test func theAccessibilityLabelSaysStampsAndTheWord() {
        #expect(Formatting.stampAccessibilityLabel(3) == "Tre stämplar, Måste upplevas")
        #expect(Formatting.stampAccessibilityLabel(0) == "Ingen stämpel, Inget extra")
    }
}
