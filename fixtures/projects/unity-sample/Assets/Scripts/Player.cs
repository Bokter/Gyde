using UnityEngine;

// PROPRIETARY_MARKER_DO_NOT_SEND
// Privacy fixture: nothing from this file (path, name or content) may appear in a request to the
// backend. A test runs the whole client pipeline and checks the outgoing payload for this marker.
public class Player : MonoBehaviour
{
    private const string SecretGameplayFormula = "PROPRIETARY_MARKER_DO_NOT_SEND";

    private void Update()
    {
        transform.Translate(Vector3.forward * Time.deltaTime);
    }
}
