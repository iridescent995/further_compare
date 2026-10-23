# Further Compare 2.53.2

New session clicks made during a folder operation now wait for that operation instead of disappearing. The welcome screen and existing tab switches share a navigation request sequence, so the latest click wins without losing comparison drafts.

Regression coverage holds native folder refresh pending, requests New session, and checks that the welcome screen appears after release. It also checks both click orders between an existing tab and New session. Existing switch, close, Cancel, Save and Discard scenarios continue to pass.

Validation: navigation suite passed in source and packaged Apple Silicon and Intel Mac apps. Source and packaged Intel appearance suites passed, including the previously failing transition from folder comparison to a new text session. All three archives passed ZIP integrity checks; packaged versions, UI bundles and shared styles match the source build. Windows runtime verification remains pending.
